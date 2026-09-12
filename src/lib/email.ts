import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// Email service abstraction
// ---------------------------------------------------------------------------

export type EmailEvent =
  | "appointment_confirmation"
  | "appointment_cancellation"
  | "appointment_pending"
  | "appointment_reschedule"
  | "appointment_confirmation_request";

export interface AppointmentEmailData {
  patientName: string;
  referenceNumber: string;
  serviceName: string;
  dentistName: string;
  date: string; // human readable
  time: string; // human readable
  previousDate?: string; // human readable (reschedule emails only)
  previousTime?: string; // human readable (reschedule emails only)
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
// Email templates
// ---------------------------------------------------------------------------

/**
 * Wraps email content in a complete, well-formed HTML document. Full documents
 * with a matching plain-text alternative are scored as less spammy by mail
 * providers than bare fragments.
 */
function layout(contentHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${clinicName()}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f2ef;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f2ef;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background-color:#0E0F10;padding:24px 32px;">
              <span style="color:#ffffff;font-size:18px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">${clinicName()}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:15px;line-height:1.6;">
              ${contentHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;font-family:Arial,Helvetica,sans-serif;">
              ${clinicName()}<br />This is an automated message. Please contact the clinic for any questions.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function detailRows(d: AppointmentEmailData): string {
  const rows = [
    ["Appointment Reference:", d.referenceNumber],
    ["Service:", d.serviceName],
    ["Dentist:", d.dentistName],
    ["Date:", d.date],
    ["Time:", d.time],
  ];
  return rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 0;color:#6b7280;width:180px;vertical-align:top;">${label}</td><td style="padding:8px 0;font-weight:600;color:#111827;">${value}</td></tr>`
    )
    .join("");
}

function textDetails(d: AppointmentEmailData): string {
  return [
    `Appointment Reference: ${d.referenceNumber}`,
    `Service: ${d.serviceName}`,
    `Dentist: ${d.dentistName}`,
    `Date: ${d.date}`,
    `Time: ${d.time}`,
  ].join("\n");
}

const templates: Record<EmailEvent, { subject: string; html: (d: AppointmentEmailData) => string; text: (d: AppointmentEmailData) => string }> = {
  appointment_pending: {
    subject: "Appointment Request Received",
    html: (d) =>
      layout(`
        <p>Hello <strong>${d.patientName}</strong>,</p>
        <p>We have received your appointment request. Here are the details:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
          ${detailRows(d)}
        </table>
        <p>Your request is <strong>pending confirmation</strong>. We will notify you as soon as the clinic confirms your appointment.</p>
        <p style="margin-top:24px;">Thank you for choosing ${clinicName()}!</p>
      `),
    text: (d) =>
      `Hello ${d.patientName},\n\nWe have received your appointment request:\n\n${textDetails(d)}\n\nYour request is pending confirmation. We will notify you as soon as the clinic confirms your appointment.\n\nThank you for choosing ${clinicName()}!`,
  },
  appointment_confirmation: {
    subject: "Appointment Confirmed",
    html: (d) =>
      layout(`
        <p>Hello <strong>${d.patientName}</strong>,</p>
        <p>Your dental appointment has been <strong>confirmed</strong>. Here are the details:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
          ${detailRows(d)}
        </table>
        <p>If you need to reschedule or cancel, please contact us at your earliest convenience.</p>
        <p style="margin-top:24px;">We look forward to seeing you!</p>
      `),
    text: (d) =>
      `Hello ${d.patientName},\n\nYour dental appointment has been confirmed:\n\n${textDetails(d)}\n\nIf you need to reschedule or cancel, please contact us at your earliest convenience.\n\nWe look forward to seeing you!`,
  },
  appointment_reschedule: {
    subject: "Appointment Rescheduled",
    html: (d) =>
      layout(`
        <p>Hello <strong>${d.patientName}</strong>,</p>
        <p>Your dental appointment has been <strong>rescheduled</strong>. Here are your updated details:</p>
        ${
          d.previousDate && d.previousTime
            ? `<p style="color:#6b7280;margin:4px 0 0;">Previous schedule: ${d.previousDate} at ${d.previousTime}</p>`
            : ""
        }
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
          ${detailRows(d)}
        </table>
        <p>If this change does not work for you, please contact the clinic so we can find a better time.</p>
        <p style="margin-top:24px;">We look forward to seeing you!</p>
      `),
    text: (d) =>
      `Hello ${d.patientName},\n\nYour dental appointment has been rescheduled. Here are your updated details:\n\n${
        d.previousDate && d.previousTime ? `Previous schedule: ${d.previousDate} at ${d.previousTime}\n` : ""
      }${textDetails(d)}\n\nIf this change does not work for you, please contact the clinic so we can find a better time.\n\nWe look forward to seeing you!`,
  },
  appointment_cancellation: {
    subject: "Appointment Cancelled",
    html: (d) =>
      layout(`
        <p>Hello <strong>${d.patientName}</strong>,</p>
        <p>Your dental appointment has been <strong>cancelled</strong>.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
          <tr><td style="padding:8px 0;color:#6b7280;width:180px;vertical-align:top;">Appointment Reference:</td><td style="padding:8px 0;font-weight:600;color:#111827;">${d.referenceNumber}</td></tr>
        </table>
        <p>If this was unexpected, please contact the clinic to reschedule.</p>
      `),
    text: (d) =>
      `Hello ${d.patientName},\n\nYour dental appointment has been cancelled. Appointment Reference: ${d.referenceNumber}.\n\nIf this was unexpected, please contact the clinic to reschedule.`,
  },
  appointment_confirmation_request: {
    subject: "Please confirm your appointment",
    html: (d) =>
      layout(`
        <p>Hello <strong>${d.patientName}</strong>,</p>
        <p>This is a friendly reminder that your appointment is still <strong>pending confirmation</strong>. Please confirm it with the clinic so we can hold your slot:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
          ${detailRows(d)}
        </table>
        <p>If you can no longer make this time, please let us know and we will help you find another.</p>
        <p style="margin-top:24px;">Thank you for choosing ${clinicName()}!</p>
      `),
    text: (d) =>
      `Hello ${d.patientName},\n\nThis is a friendly reminder that your appointment is still pending confirmation. Please confirm it with the clinic so we can hold your slot:\n\n${textDetails(d)}\n\nIf you can no longer make this time, please let us know and we will help you find another.\n\nThank you for choosing ${clinicName()}!`,
  },
};

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
): Promise<{ ok: boolean; status: string; error?: string }> {
  const template = templates[event];
  const subject = template.subject;
  const html = template.html(data);
  const text = template.text(data);

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
      console.log(`[email:${PREVIEW_MODE ? "SKIPPED" : "FAILED"}] ${event} -> ${to} (${subject})`);
      return {
        ok: PREVIEW_MODE,
        status: PREVIEW_MODE ? "SKIPPED" : "FAILED",
        error: PREVIEW_MODE ? "Email preview mode enabled (no SMTP)." : "SMTP not configured.",
      };
    }

    await getTransporter()!.sendMail({
      from: process.env.SMTP_FROM || `${clinicName()} <no-reply@${process.env.SMTP_HOST || "aetherdental.local"}>`,
      to,
      subject,
      html,
      text,
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
    return {
      ok: false,
      status: "FAILED",
      error: err instanceof Error ? err.message : "Unknown email error",
    };
  }
}