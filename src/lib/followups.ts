import { prisma } from "@/lib/db";
import { sendAppointmentEmail, type AppointmentEmailData } from "@/lib/email";

// ---------------------------------------------------------------------------
// Follow-up emails
// ---------------------------------------------------------------------------
// Appointment follow-ups are scheduled 1 day (configurable per patient) after a
// completed appointment, then sent automatically by `processDueFollowUps()`.
// The processor can be triggered by the dashboard ("Process due now"), the cron
// endpoint (`/api/cron/followups`), or lazily when an admin loads the dashboard.

export interface FollowUpSummary {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

/** Compute when a follow-up should fire: appointment date + patient preference, at 09:00 UTC. */
function computeScheduledFor(appointmentDate: Date, days: number): Date {
  const d = new Date(appointmentDate);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(9, 0, 0, 0);
  return d;
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** Build the email payload from a follow-up's appointment data. */
function emailDataFor(appointment: {
  referenceNumber: string;
  appointmentDate: Date;
  startTime: string;
  patient: { firstName: string; lastName: string };
  service: { name: string };
  dentist: { name: string };
}): AppointmentEmailData {
  return {
    patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
    referenceNumber: appointment.referenceNumber,
    serviceName: appointment.service.name,
    dentistName: appointment.dentist.name,
    date: fmtDate(appointment.appointmentDate),
    time: fmtTime(appointment.startTime),
  };
}

const followUpInclude = {
  patient: { select: { firstName: true, lastName: true, email: true } },
  appointment: {
    include: { patient: true, service: true, dentist: true },
  },
} as const;

/**
 * Schedules a follow-up for a completed appointment.
 * No-op (returns null) when the patient has no email or opted out, or when a
 * follow-up for the appointment already exists.
 */
export async function scheduleFollowUpForAppointment(appointmentId: string) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: true },
  });
  if (!appt) return null;

  const existing = await prisma.followUp.findUnique({ where: { appointmentId } });
  if (existing) return existing;

  if (!appt.patient.email || !appt.patient.followUpEnabled) return null;

  return prisma.followUp.create({
    data: {
      patientId: appt.patientId,
      appointmentId: appt.id,
      scheduledFor: computeScheduledFor(appt.appointmentDate, appt.patient.followUpDays),
    },
  });
}

/** Sends one follow-up and records the outcome on the FollowUp row. */
async function sendFollowUp(row: { id: string }) {
  const full = await prisma.followUp.findUnique({
    where: { id: row.id },
    include: followUpInclude,
  });
  if (!full) return { ok: false as const, status: "FAILED" as const };

  const email = full.patient.email;
  if (!email) {
    await prisma.followUp.update({ where: { id: full.id }, data: { status: "SKIPPED" } });
    return { ok: false as const, status: "SKIPPED" as const };
  }

  const result = await sendAppointmentEmail("appointment_followup", email, emailDataFor(full.appointment));

  await prisma.followUp.update({
    where: { id: full.id },
    data: {
      status: result.ok ? "SENT" : "FAILED",
      sentAt: result.ok ? new Date() : null,
      error: result.ok ? null : result.error || "Follow-up email failed.",
    },
  });

  return { ok: result.ok, status: result.status };
}

/**
 * Sends every due follow-up (scheduledFor <= now). Rows are claimed with a
 * status transition (SCHEDULED -> SENDING) before sending so concurrent runs
 * never double-send. Stale SENDING rows from a crashed process are reclaimed.
 */
export async function processDueFollowUps(): Promise<FollowUpSummary> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60 * 1000);
  const summary: FollowUpSummary = { processed: 0, sent: 0, failed: 0, skipped: 0 };

  const claimed = await prisma.followUp.updateMany({
    where: {
      OR: [
        { status: "SCHEDULED", scheduledFor: { lte: now } },
        { status: "SENDING", updatedAt: { lt: staleBefore } },
      ],
    },
    data: { status: "SENDING" },
  });
  if (claimed.count === 0) return summary;

  const rows = await prisma.followUp.findMany({
    where: { status: "SENDING" },
    include: followUpInclude,
  });

  for (const row of rows) {
    const email = row.patient.email;
    if (!email) {
      await prisma.followUp.update({ where: { id: row.id }, data: { status: "SKIPPED" } });
      summary.processed++;
      summary.skipped++;
      continue;
    }

    const result = await sendAppointmentEmail("appointment_followup", email, emailDataFor(row.appointment));

    await prisma.followUp.update({
      where: { id: row.id },
      data: {
        status: result.ok ? "SENT" : "FAILED",
        sentAt: result.ok ? new Date() : null,
        error: result.ok ? null : result.error || "Follow-up email failed.",
      },
    });

    summary.processed++;
    if (result.ok) summary.sent++;
    else summary.failed++;
  }

  return summary;
}

/**
 * Manually sends an individual follow-up immediately (used by the dashboard
 * "Send now" action). Idempotent for already-sent items.
 */
export async function sendFollowUpNow(followUpId: string): Promise<{ ok: boolean; status: string; message?: string }> {
  const existing = await prisma.followUp.findUnique({ where: { id: followUpId } });
  if (!existing) return { ok: false, status: "MISSING", message: "Follow-up not found." };
  if (existing.status === "SENT") return { ok: true, status: "SENT", message: "Follow-up was already sent." };
  if (existing.status === "SKIPPED") return { ok: false, status: "SKIPPED", message: "Follow-up was skipped because the patient has no email." };

  const result = await sendFollowUp(existing);
  return { ok: result.ok, status: result.status };
}

/** Dashboard helper: count follow-ups still awaiting an email (scheduled, sending, or failed). */
export async function getPendingFollowUpCount(): Promise<number> {
  return prisma.followUp.count({
    where: { status: { in: ["SCHEDULED", "SENDING", "FAILED"] } },
  });
}