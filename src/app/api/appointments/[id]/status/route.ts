import { NextResponse } from "next/server";
import { z } from "zod";
import { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api";
import { sendAppointmentEmail } from "@/lib/email";

const statusSchema = z.object({
  status: z.nativeEnum(AppointmentStatus),
  notes: z.string().optional(),
});

// PATCH /api/appointments/[id]/status
// Update the status of an appointment (staff only, role-scoped)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireAuth();
  if (error) return error;

  try {
    const body = statusSchema.parse(await req.json());
    const { status, notes } = body;

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
        return NextResponse.json({ success: false, message: "You do not have permission to update this appointment." }, { status: 403 });
      }
      // Dentists can only set clinical statuses
      if (["CHECKED_IN", "COMPLETED", "NO_SHOW", "CONFIRMED"].includes(status) === false) {
        return NextResponse.json({ success: false, message: "You do not have permission to perform this action." }, { status: 403 });
      }
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        status,
        ...(notes !== undefined ? { notes } : {}),
      },
      include: { patient: true, dentist: true, service: true },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        action: `Appointment ${status.toLowerCase().replace("_", " ")}`,
        entity: "Appointment",
        entityId: updated.id,
        description: `${user.name} marked appointment ${updated.referenceNumber} as ${status.replace("_", " ")}`,
        userId: user.id,
      },
    });

    // Send cancellation / confirmation emails
    if (status === "CANCELLED" && existing.patient?.email) {
      await sendAppointmentEmail("appointment_cancellation", existing.patient.email, {
        patientName: `${existing.patient.firstName} ${existing.patient.lastName}`,
        referenceNumber: existing.referenceNumber,
        serviceName: existing.service.name,
        dentistName: existing.dentist.name,
        date: existing.appointmentDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        time: fmtTime(existing.startTime),
      });
    }
    if (status === "CONFIRMED" && existing.patient?.email) {
      await sendAppointmentEmail("appointment_confirmation", existing.patient.email, {
        patientName: `${existing.patient.firstName} ${existing.patient.lastName}`,
        referenceNumber: existing.referenceNumber,
        serviceName: existing.service.name,
        dentistName: existing.dentist.name,
        date: existing.appointmentDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        time: fmtTime(existing.startTime),
      });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
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
