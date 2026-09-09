import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// Email service abstraction
// ---------------------------------------------------------------------------

export type EmailEvent =
  | "appointment_confirmation"
  | "appointment_cancellation"
  | "appointment_rescheduling";

export interface AppointmentEmailData {
  patientName: string;
  referenceNumber: string;
  serviceName: string;
  dentistName: string;
  date: string; // human readable
  time: string; // human readable
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host) return null;

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: user ? { user, pass: pass || "" } : undefined,
  });
  return transporter;
}

const PREVIEW_MODE = process.env.EMAIL_PREVIEW_MODE === "true";

function clinicName() {
  return process.env.NEXT_PUBLIC_APP_NAME || "Aether Dental";
}

// ---------------------------------------------------------------------------
// HTML templates
// ---------------------------------------------------------------------------

function confirmationTemplate(d: AppointmentEmailData): string {
  const rows = [
    ["Appointment Reference:", d.referenceNumber],
    ["Service:", d.serviceName],
    ["Dentist:", d.dentistName],
    ["Date:", d.date],
    ["Time:", d.time],
  ];
  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 0;color:#6b7280;width:180px;">${label}</td><td style="padding:8px 0;font-weight:600;color:#111827;">${value}</td></tr>`
    )
    .join("");

  return `
    <p>Hello <strong>${d.patientName}</strong>,</p>
    <p>Your dental appointment has been <strong>confirmed</strong>. Here are the details:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      ${rowsHtml}
    </table>
    <p>If you need to reschedule or cancel, please contact us at your earliest convenience.</p>
    <p style="margin-top:24px;">We look forward to seeing you!</p>
  `;
}

function cancellationTemplate(d: AppointmentEmailData): string {
  return `
    <p>Hello <strong>${d.patientName}</strong>,</p>
    <p>Your dental appointment has been <strong>cancelled</strong>.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr><td style="padding:8px 0;color:#6b7280;width:180px;">Appointment Reference:</td><td style="padding:8px 0;font-weight:600;color:#111827;">${d.referenceNumber}</td></tr>
    </table>
    <p>If this was unexpected, please contact the clinic to reschedule.</p>
  `;
}

function subjectFor(event: EmailEvent): string {
  switch (event) {
    case "appointment_confirmation":
      return "Appointment Confirmed";
    case "appointment_cancellation":
      return "Appointment Cancelled";
    case "appointment_rescheduling":
      return "Appointment Rescheduled";
  }
}

// ---------------------------------------------------------------------------
// Send + log
// ---------------------------------------------------------------------------

/**
 * Sends an appointment email and logs the outcome to the email_logs table.
 * Email delivery is decoupled from the appointment transaction — failures are
 * logged and never roll back the appointment.
 */
export async function sendAppointmentEmail(
  event: EmailEvent,
  to: string,
  data: AppointmentEmailData
): Promise<{ ok: boolean; status: string }> {
  const subject = subjectFor(event);
  const html =
    event === "appointment_confirmation"
      ? confirmationTemplate(data)
      : event === "appointment_cancellation"
        ? cancellationTemplate(data)
        : confirmationTemplate(data);

  try {
    // Preview mode: skip SMTP, log as SKIPPED (for local/demo without SMTP)
    if (PREVIEW_MODE || !getTransporter()) {
      await prisma.emailLog.create({
        data: {
          to,
          subject,
          template: event,
          status: PREVIEW_MODE ? "SKIPPED" : "FAILED",
          error: PREVIEW_MODE ? "Email preview mode enabled (no SMTP)." : "SMTP not configured.",
        },
      });
      console.log(`[email:${statusFor(PREVIEW_MODE)}] ${event} -> ${to} (${subject})`);
      return { ok: PREVIEW_MODE, status: PREVIEW_MODE ? "SKIPPED" : "FAILED" };
    }

    await getTransporter()!.sendMail({
      from: process.env.SMTP_FROM || `${clinicName()} <no-reply@aetherdental.local>`,
      to,
      subject,
      html,
    });

    await prisma.emailLog.create({
      data: { to, subject, template: event, status: "SENT" },
    });
    console.log(`[email:SENT] ${event} -> ${to} (${subject})`);
    return { ok: true, status: "SENT" };
  } catch (err) {
    console.error("[email] send failed:", err);
    try {
      await prisma.emailLog.create({
        data: {
          to,
          subject,
          template: event,
          status: "FAILED",
          error: err instanceof Error ? err.message : "Unknown email error",
        },
      });
    } catch {
      // log failure itself failed; ignore
    }
    return { ok: false, status: "FAILED" };
  }
}

function statusFor(preview: boolean): string {
  return preview ? "SKIPPED" : "FAILED";
}

/**
 * Sends the confirmation email after a new appointment is created.
 * The appointment must already exist; failures are logged not thrown.
 */
export async function sendConfirmationEmail(
  to: string,
  data: AppointmentEmailData
): Promise<{ ok: boolean; status: string }> {
  return sendAppointmentEmail("appointment_confirmation", to, data);
}
