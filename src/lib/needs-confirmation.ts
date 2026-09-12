import { prisma } from "@/lib/db";
import { CONFIRMATION_LEAD_DAYS, confirmationWindow } from "@/lib/clinic-time";

// ---------------------------------------------------------------------------
// Needs Confirmation (on-demand, derived from appointments)
// ---------------------------------------------------------------------------
// No table, no queue, no cron. This is a read-only projection of the existing
// appointments data: PENDING appointments scheduled within the clinic-local
// lead-time window (tomorrow .. today + CONFIRMATION_LEAD_DAYS).

export interface NeedsConfirmationResult {
  appointments: Awaited<ReturnType<typeof fetchAppointments>>;
  windowDays: number;
  from: string;
  to: string;
}

function fetchAppointments(from: Date, to: Date) {
  return prisma.appointment.findMany({
    where: {
      status: "PENDING",
      appointmentDate: { gte: from, lte: to },
    },
    select: {
      id: true,
      referenceNumber: true,
      appointmentDate: true,
      startTime: true,
      endTime: true,
      status: true,
      confirmationEmailSentAt: true,
      confirmationEmailStatus: true,
      patient: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      },
      service: { select: { name: true, durationMin: true } },
      dentist: { select: { name: true } },
    },
    orderBy: [{ appointmentDate: "asc" }, { startTime: "asc" }],
  });
}

/** Returns the PENDING appointments inside the confirmation window. */
export async function getNeedsConfirmation(now = new Date()): Promise<NeedsConfirmationResult> {
  const { from, to } = confirmationWindow(now);
  const appointments = await fetchAppointments(from, to);
  return {
    appointments,
    windowDays: CONFIRMATION_LEAD_DAYS,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}
