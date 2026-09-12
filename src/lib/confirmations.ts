import { prisma } from "@/lib/db";
import { sendAppointmentEmail, type AppointmentEmailData } from "@/lib/email";

// ---------------------------------------------------------------------------
// Confirmation emails
// ---------------------------------------------------------------------------
// Sends a "please confirm your appointment" email to the patient and records
// the attempt: an append-only `ConfirmationEmail` row for history plus the
// latest outcome denormalized on the Appointment for fast reads.
// Statuses are string literals so this module never depends on the generated
// Prisma enum object at runtime.

export type ConfirmationSendStatus = "SENT" | "FAILED" | "SKIPPED";

export interface ConfirmationSendOutcome {
  found: boolean;
  allowed: boolean;
  /** Present when `allowed` is false. */
  reason?: string;
  status?: ConfirmationSendStatus;
  error?: string;
  sentAt?: string | null;
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

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

/**
 * Sends the confirmation-request email and persists the outcome.
 * Only PENDING appointments with a patient email are eligible.
 */
export async function sendConfirmationEmail(
  appointmentId: string,
  sentById: string | null,
): Promise<ConfirmationSendOutcome> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: true, service: true, dentist: true },
  });

  if (!appointment) return { found: false, allowed: false };
  if (appointment.status !== "PENDING") {
    return {
      found: true,
      allowed: false,
      reason: "Only pending appointments can be sent a confirmation request.",
    };
  }
  if (!appointment.patient.email) {
    return { found: true, allowed: false, reason: "This patient has no email on file." };
  }

  const result = await sendAppointmentEmail(
    "appointment_confirmation_request",
    appointment.patient.email,
    emailDataFor(appointment),
  );

  const status: ConfirmationSendStatus =
    result.status === "SENT" ? "SENT" : result.status === "SKIPPED" ? "SKIPPED" : "FAILED";
  const now = new Date();
  const sentAt = status === "SENT" ? now : null;
  const error = status === "FAILED" ? result.error || "Confirmation email failed." : null;

  await prisma.$transaction([
    prisma.confirmationEmail.create({
      data: {
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        to: appointment.patient.email,
        status,
        error,
        sentById,
        createdAt: now,
      },
    }),
    prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        confirmationEmailSentAt: sentAt,
        confirmationEmailStatus: status,
        confirmationEmailSentById: sentById,
      },
    }),
  ]);

  return {
    found: true,
    allowed: true,
    status,
    error: error ?? undefined,
    sentAt: sentAt ? sentAt.toISOString() : null,
  };
}
