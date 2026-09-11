import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api";
import { isSlotAvailable } from "@/lib/scheduling";
import { sendAppointmentEmail } from "@/lib/email";
import { notifyAppointmentRescheduled } from "@/lib/notifications";

// PATCH /api/appointments/[id]
// Edit an existing appointment (date, time, dentist, service, notes) and its
// patient details. Staff only, role-scoped:
//   - ADMIN / RECEPTIONIST: full editing including patient info + dentist assignment
//   - DENTIST: only their own appointments, and only date/time/service/notes
//
// The patient-facing reschedule email + in-app notification are sent only when
// the schedule actually changes; failures never roll back the update.

const updateSchema = z.object({
  appointmentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
    .optional(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Time must be in HH:mm format.")
    .optional(),
  serviceId: z.string().min(1, "Service is required.").optional(),
  dentistId: z.string().min(1, "Dentist is required.").optional(),
  notes: z.string().nullable().optional(),
  patient: z
    .object({
      firstName: z.string().trim().min(1, "First name is required.").optional(),
      lastName: z.string().trim().min(1, "Last name is required.").optional(),
      email: z.string().trim().email("Please provide a valid email address.").optional(),
      phone: z.string().trim().min(7, "Please provide a valid phone number.").optional(),
    })
    .optional(),
});

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}

function fmtDate(d: Date): string {
  // appointmentDate is stored as @db.Date (midnight UTC); format in UTC so the
  // email date always matches the booked date regardless of server timezone.
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function fmtDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireAuth();
  if (error) return error;

  let body: z.infer<typeof updateSchema>;
  try {
    body = updateSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      const details: Record<string, string[]> = {};
      for (const i of err.issues) {
        const key = i.path.join(".") || "form";
        if (!details[key]) details[key] = [];
        details[key].push(i.message);
      }
      return NextResponse.json(
        { success: false, message: "Please check the highlighted fields.", details },
        { status: 422 }
      );
    }
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }

  try {
    const existing = await prisma.appointment.findUnique({
      where: { id },
      include: { patient: true, dentist: true, service: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, message: "Appointment not found." }, { status: 404 });
    }

    // Role scoping
    if (user.role === "DENTIST") {
      const assigned = await prisma.dentist.findFirst({ where: { email: user.email } });
      if (!assigned || assigned.id !== existing.dentistId) {
        return NextResponse.json(
          { success: false, message: "You do not have permission to edit this appointment." },
          { status: 403 }
        );
      }
      // Dentists must not reassign the dentist or edit patient identity.
      if (body.dentistId || body.patient) {
        return NextResponse.json(
          { success: false, message: "You do not have permission to change the dentist or patient details." },
          { status: 403 }
        );
      }
    }

    const hasPatientChanges = Boolean(body.patient && Object.keys(body.patient).length > 0);

    // Resolve effective values after the update
    const appointmentDate = body.appointmentDate
      ? new Date(`${body.appointmentDate}T00:00:00.000Z`)
      : existing.appointmentDate;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Only block when the caller is actively moving the appointment to a past
    // date. Note/patient-only edits on an existing (maybe already past) visit
    // must keep working.
    if (body.appointmentDate && appointmentDate < today) {
      return NextResponse.json(
        { success: false, message: "Appointments cannot be scheduled in the past." },
        { status: 400 }
      );
    }

    const [service, dentist] = await Promise.all([
      body.serviceId
        ? prisma.service.findUnique({ where: { id: body.serviceId } })
        : Promise.resolve(existing.service),
      body.dentistId
        ? prisma.dentist.findUnique({ where: { id: body.dentistId } })
        : Promise.resolve(existing.dentist),
    ]);
    // Only enforce ACTIVE when the caller is actually switching service/dentist;
    // a note-only edit on an appointment whose service was later deactivated
    // must still work.
    if (body.serviceId && body.serviceId !== existing.serviceId && (!service || service.status !== "ACTIVE")) {
      return NextResponse.json({ success: false, message: "This service is not available." }, { status: 400 });
    }
    if (body.dentistId && body.dentistId !== existing.dentistId && (!dentist || dentist.status !== "ACTIVE")) {
      return NextResponse.json({ success: false, message: "This dentist is not available." }, { status: 400 });
    }
    if (!service) {
      return NextResponse.json({ success: false, message: "The linked service no longer exists." }, { status: 400 });
    }
    if (!dentist) {
      return NextResponse.json({ success: false, message: "The linked dentist no longer exists." }, { status: 400 });
    }

    const startTime = body.startTime || existing.startTime;
    const [sh, sm] = startTime.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = startMin + service.durationMin;
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

    // Only these changes can affect double-booking; a notes-only update on a
    // past appointment is therefore allowed without an availability re-check.
    const scheduleChanged =
      (body.appointmentDate !== undefined && body.appointmentDate !== fmtDateKey(existing.appointmentDate)) ||
      (body.startTime !== undefined && body.startTime !== existing.startTime) ||
      (body.serviceId !== undefined && body.serviceId !== existing.serviceId) ||
      (body.dentistId !== undefined && body.dentistId !== existing.dentistId);

    if (scheduleChanged) {
      const available = await isSlotAvailable(dentist.id, startTime, endTime, appointmentDate, id);
      if (!available) {
        return NextResponse.json(
          { success: false, message: "That time is no longer available. Please select another slot." },
          { status: 409 }
        );
      }
    }

    // Prevent two patients from sharing the same email/phone if identity changed
    const newEmail = body.patient?.email ? body.patient.email.toLowerCase() : undefined;
    if (body.patient?.phone || newEmail) {
      const dup = await prisma.patient.findFirst({
        where: {
          id: { not: existing.patientId },
          OR: [
            ...(newEmail ? [{ email: newEmail }] : []),
            ...(body.patient?.phone ? [{ phone: body.patient.phone }] : []),
          ],
        },
      });
      if (dup) {
        return NextResponse.json(
          { success: false, message: "That email or phone number already belongs to another patient." },
          { status: 409 }
        );
      }
    }

    // Apply the update atomically with the activity log
    const updated = await prisma.$transaction(async (tx) => {
      if (hasPatientChanges) {
        await tx.patient.update({
          where: { id: existing.patientId },
          data: {
            ...(body.patient!.firstName ? { firstName: body.patient!.firstName } : {}),
            ...(body.patient!.lastName ? { lastName: body.patient!.lastName } : {}),
            ...(newEmail ? { email: newEmail } : {}),
            ...(body.patient!.phone ? { phone: body.patient!.phone } : {}),
          },
        });
      }

      const appt = await tx.appointment.update({
        where: { id },
        data: {
          ...(body.appointmentDate ? { appointmentDate } : {}),
          ...(body.startTime ? { startTime } : {}),
          // endTime must follow the schedule: recompute whenever any component changes
          ...(scheduleChanged ? { endTime } : {}),
          ...(body.serviceId ? { serviceId: service.id } : {}),
          ...(body.dentistId ? { dentistId: dentist.id } : {}),
          ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
        },
        include: { patient: true, dentist: true, service: true },
      });

      await tx.activity.create({
        data: {
          action: "Appointment updated",
          entity: "Appointment",
          entityId: appt.id,
          description: `${user.name} updated appointment ${appt.referenceNumber}`,
          userId: user.id,
        },
      });

      return appt;
    });

    // Patient-facing reschedule email (only when the schedule actually changed)
    let emailResult: { ok: boolean; status: string } | null = null;
    if (scheduleChanged && updated.patient?.email) {
      emailResult = await sendAppointmentEmail("appointment_reschedule", updated.patient.email, {
        patientName: `${updated.patient.firstName} ${updated.patient.lastName}`,
        referenceNumber: updated.referenceNumber,
        serviceName: updated.service.name,
        dentistName: updated.dentist.name,
        date: fmtDate(updated.appointmentDate),
        time: fmtTime(updated.startTime),
        previousDate: fmtDate(existing.appointmentDate),
        previousTime: fmtTime(existing.startTime),
      });
    }

    // In-app notifications (never allowed to fail the update)
    if (scheduleChanged) {
      try {
        await notifyAppointmentRescheduled(updated, {
          date: existing.appointmentDate,
          time: existing.startTime,
        });
      } catch (e) {
        console.error("Failed to create reschedule notification:", e);
      }
    }

    return NextResponse.json({ success: true, data: updated, email: emailResult });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { success: false, message: "That email or phone number already belongs to another patient." },
        { status: 409 }
      );
    }
    console.error("PATCH /api/appointments/[id] failed:", err);
    return NextResponse.json({ success: false, message: "Unable to update the appointment." }, { status: 500 });
  }
}