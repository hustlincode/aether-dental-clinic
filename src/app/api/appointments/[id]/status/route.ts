import { NextResponse } from "next/server";
import { z } from "zod";
import { AppointmentStatus } from "@prisma/client";
import { AppointmentError, appointmentTransaction } from "@/lib/appointment-transaction";
import { canTransition } from "@/lib/appointment-rules";
import { isSlotAvailable } from "@/lib/scheduling";
import { requireWriteAuth } from "@/lib/api";
import { sendAppointmentEmail } from "@/lib/email";
import {
  notifyAppointmentCancelled,
  notifyAppointmentCompleted,
  notifyAppointmentConfirmed,
  notifyPatientCheckedIn,
} from "@/lib/notifications";

const statusSchema = z.object({
  status: z.nativeEnum(AppointmentStatus),
  notes: z.string().max(4000).optional(),
});

// PATCH /api/appointments/[id]/status
// Update the status of an appointment (staff only, role-scoped)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireWriteAuth();
  if (error) return error;

  try {
    const body = statusSchema.parse(await req.json());
    const { status, notes } = body;

    const { updated, changed } = await appointmentTransaction(async (tx) => {
      const existing = await tx.appointment.findUnique({
        where: { id }, include: { patient: true, dentist: true, service: true },
      });
      if (!existing) throw new AppointmentError("Appointment not found.", 404);
      if (user.role === "DENTIST") {
        const assigned = await tx.dentist.findFirst({ where: { email: user.email } });
        if (!assigned || assigned.id !== existing.dentistId || !["CHECKED_IN", "COMPLETED", "NO_SHOW", "CONFIRMED"].includes(status)) {
          throw new AppointmentError("You do not have permission to perform this action.", 403);
        }
      }
      if (!canTransition(existing.status, status)) throw new AppointmentError("This appointment status transition is not allowed.");
      // Retries repeat no side effects; notes-only edits use the appointment PATCH endpoint.
      if (existing.status === status) return { updated: existing, changed: false };
      if (status === "CONFIRMED") {
        if (existing.service.status !== "ACTIVE" || !await isSlotAvailable(existing.dentistId, existing.startTime, existing.endTime, existing.appointmentDate, id, tx)) {
          throw new AppointmentError("This appointment no longer fits the available schedule.");
        }
      }
      const updated = await tx.appointment.update({
        where: { id }, data: { status, ...(notes !== undefined ? { notes } : {}) },
        include: { patient: true, dentist: true, service: true },
      });
      await tx.activity.create({ data: {
        action: `Appointment ${status.toLowerCase().replace("_", " ")}`,
        entity: "Appointment", entityId: updated.id,
        description: `${user.name} marked appointment ${updated.referenceNumber} as ${status.replace("_", " ")}`,
        userId: user.id,
      } });
      return { updated, changed: true };
    });
    if (!changed) return NextResponse.json({ success: true, data: updated, email: null });
    const existing = updated;

    // In-app notifications (role-aware; never allowed to fail the status update).
    try {
      if (status === "CONFIRMED") await notifyAppointmentConfirmed(updated);
      else if (status === "CANCELLED") await notifyAppointmentCancelled(updated);
      else if (status === "CHECKED_IN") await notifyPatientCheckedIn(updated);
      else if (status === "COMPLETED") await notifyAppointmentCompleted(updated);
    } catch (e) {
      console.error("Failed to create appointment notification:", e);
    }

    // Send cancellation / confirmation emails
    let emailResult: { ok: boolean; status: string } | null = null;
    if (status === "CANCELLED" && existing.patient?.email) {
      emailResult = await sendAppointmentEmail("appointment_cancellation", existing.patient.email, {
        patientName: `${existing.patient.firstName} ${existing.patient.lastName}`,
        referenceNumber: existing.referenceNumber,
        serviceName: existing.service.name,
        dentistName: existing.dentist.name,
        date: fmtDate(existing.appointmentDate),
        time: fmtTime(existing.startTime),
      }).catch((error) => {
        console.error("Appointment status email failed:", error);
        return { ok: false, status: "FAILED" };
      });
    }
    if (status === "CONFIRMED" && existing.patient?.email) {
      emailResult = await sendAppointmentEmail("appointment_confirmation", existing.patient.email, {
        patientName: `${existing.patient.firstName} ${existing.patient.lastName}`,
        referenceNumber: existing.referenceNumber,
        serviceName: existing.service.name,
        dentistName: existing.dentist.name,
        date: fmtDate(existing.appointmentDate),
        time: fmtTime(existing.startTime),
      }).catch((error) => {
        console.error("Appointment status email failed:", error);
        return { ok: false, status: "FAILED" };
      });
    }

    return NextResponse.json({ success: true, data: updated, email: emailResult });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
    }
    if (err instanceof AppointmentError) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: "Invalid status value." }, { status: 422 });
    }
    console.error("PATCH /api/appointments/[id]/status failed:", err);
    return NextResponse.json({ success: false, message: "Unable to update the appointment." }, { status: 500 });
  }
}

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
