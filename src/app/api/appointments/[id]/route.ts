import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWriteAuth } from "@/lib/api";
import { AppointmentError, appointmentTransaction } from "@/lib/appointment-transaction";
import { appointmentEnd, isValidDateKey, isValidTime } from "@/lib/appointment-rules";
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
    .refine(isValidDateKey, "Date must be a real date in YYYY-MM-DD format.")
    .optional(),
  startTime: z
    .string()
    .refine(isValidTime, "Time must be a valid HH:mm time.")
    .optional(),
  serviceId: z.string().min(1, "Service is required.").max(100).optional(),
  dentistId: z.string().min(1, "Dentist is required.").max(100).optional(),
  notes: z.string().max(4000).nullable().optional(),
  patient: z
    .object({
      firstName: z.string().trim().min(1, "First name is required.").max(100).optional(),
      lastName: z.string().trim().min(1, "Last name is required.").max(100).optional(),
      email: z.string().trim().email("Please provide a valid email address.").max(254).optional(),
      phone: z.string().trim().min(7, "Please provide a valid phone number.").max(30).optional(),
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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireWriteAuth();
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
    const result = await appointmentTransaction(async (tx) => {
      const existing = await tx.appointment.findUnique({
        where: { id }, include: { patient: true, dentist: true, service: true },
      });
      if (!existing) throw new AppointmentError("Appointment not found.", 404);
      if (user.role === "DENTIST") {
        const assigned = await tx.dentist.findFirst({ where: { email: user.email } });
        if (!assigned || assigned.id !== existing.dentistId || body.dentistId || body.patient) {
          throw new AppointmentError("You do not have permission to edit this appointment.", 403);
        }
      }
      const appointmentDate = body.appointmentDate ? new Date(`${body.appointmentDate}T00:00:00.000Z`) : existing.appointmentDate;
      const startTime = body.startTime ?? existing.startTime;
      const serviceId = body.serviceId ?? existing.serviceId;
      const dentistId = body.dentistId ?? existing.dentistId;
      const scheduleChanged = appointmentDate.getTime() !== existing.appointmentDate.getTime() ||
        startTime !== existing.startTime || serviceId !== existing.serviceId || dentistId !== existing.dentistId;
      let endTime = existing.endTime;
      if (scheduleChanged) {
        if (["CANCELLED", "NO_SHOW", "COMPLETED"].includes(existing.status)) {
          throw new AppointmentError("Closed appointments cannot be rescheduled. Create a new booking.");
        }
        const service = await tx.service.findUnique({ where: { id: serviceId } });
        if (!service || service.status !== "ACTIVE") throw new AppointmentError("This service is not available.", 400);
        const computedEnd = appointmentEnd(startTime, service.durationMin);
        if (!computedEnd || !await isSlotAvailable(dentistId, startTime, computedEnd, appointmentDate, id, tx)) {
          throw new AppointmentError("That time is no longer available. Please select another slot.");
        }
        endTime = computedEnd;
      }
      if (body.patient && Object.keys(body.patient).length > 0) {
        await tx.patient.update({
          where: { id: existing.patientId },
          data: { ...body.patient, ...(body.patient.email ? { email: body.patient.email.toLowerCase() } : {}) },
        });
      }
      const updated = await tx.appointment.update({
        where: { id },
        data: {
          ...(scheduleChanged ? { appointmentDate, startTime, endTime, dentistId, serviceId } : {}),
          ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
        },
        include: { patient: true, dentist: true, service: true },
      });
      await tx.activity.create({ data: {
        action: "Appointment updated", entity: "Appointment", entityId: updated.id,
        description: `${user.name} updated appointment ${updated.referenceNumber}`, userId: user.id,
      } });
      return { updated, existing, scheduleChanged };
    });
    const { updated, existing, scheduleChanged } = result;

    // Patient-facing reschedule email (only when the schedule actually changed)
    const [emailResult] = await Promise.all([
      scheduleChanged && updated.patient?.email ? sendAppointmentEmail("appointment_reschedule", updated.patient.email, {
        patientName: `${updated.patient.firstName} ${updated.patient.lastName}`,
        referenceNumber: updated.referenceNumber,
        serviceName: updated.service.name,
        dentistName: updated.dentist.name,
        date: fmtDate(updated.appointmentDate),
        time: fmtTime(updated.startTime),
        previousDate: fmtDate(existing.appointmentDate),
        previousTime: fmtTime(existing.startTime),
      }).catch((error) => {
        console.error("Reschedule email failed:", error);
        return { ok: false, status: "FAILED" };
      }) : null,
      scheduleChanged ? notifyAppointmentRescheduled(updated, {
        date: existing.appointmentDate,
        time: existing.startTime,
      }).catch((error) => {
        console.error("Failed to create reschedule notification:", error);
      }) : null,
    ]);

    return NextResponse.json({ success: true, data: updated, email: emailResult });
  } catch (err) {
    if (err instanceof AppointmentError) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    }
    console.error("PATCH /api/appointments/[id] failed:", err);
    return NextResponse.json({ success: false, message: "Unable to update the appointment." }, { status: 500 });
  }
}
