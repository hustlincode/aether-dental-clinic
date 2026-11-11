import assert from "node:assert/strict";
import test from "node:test";
import { mockModuleExports } from "../helpers/mock-module";
import { SubscriptionReadOnlyError } from "../../src/lib/subscription";

test("email rendering uses each clinic's identity and escapes untrusted HTML", async (t) => {
  const priorHost = process.env.SMTP_HOST;
  const priorPreview = process.env.EMAIL_PREVIEW_MODE;
  const priorFrom = process.env.SMTP_FROM;
  process.env.SMTP_HOST = "smtp.example.test";
  process.env.EMAIL_PREVIEW_MODE = "false";
  process.env.SMTP_FROM = "Aether Dental <no-reply@platform.example.test>";
  t.after(() => {
    if (priorHost === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = priorHost;
    if (priorPreview === undefined) delete process.env.EMAIL_PREVIEW_MODE;
    else process.env.EMAIL_PREVIEW_MODE = priorPreview;
    if (priorFrom === undefined) delete process.env.SMTP_FROM;
    else process.env.SMTP_FROM = priorFrom;
  });
  let clinic: { name: string; email: string } | null = { name: "Clinic A", email: "a@example.test" };
  const sent: Array<{ html: string; text: string; replyTo: string; from: { name: string; address: string } }> = [];
  const logs: Array<{ status: string }> = [];
  const tenant = { id: "clinic-a", slug: "clinic-a", name: "Clinic A", active: true,
    subscriptionMode: "INTERNAL" as "INTERNAL" | "TRIAL" | "PAID", subscriptionEndsAt: null as Date | null };
  let expireDuringConfiguration = false;
  mockModuleExports(t, require.resolve("../../src/lib/tenant"), { getRequestTenant: async () => tenant });
  mockModuleExports(t, require.resolve("../../src/lib/db"), {
    prisma: {
      clinicSetting: { findFirst: async () => {
        if (expireDuringConfiguration) tenant.subscriptionEndsAt = new Date(0);
        return clinic;
      } },
      emailLog: { create: async ({ data }: { data: { status: string } }) => { logs.push(data); return data; } },
    },
  });
  mockModuleExports(t, require.resolve("nodemailer"), {
    createTransport: () => ({ sendMail: async (message: typeof sent[number]) => { sent.push(message); } }),
  });
  t.mock.method(console, "log", () => undefined);
  t.mock.method(console, "error", () => undefined);
  const { sendAppointmentEmail } = await import("../../src/lib/email");
  const data = {
    patientName: "<img src=x onerror=alert(1)>", referenceNumber: "APT-test",
    serviceName: "Cleaning", dentistName: "Dr. A", date: "November 9", time: "9:00 AM",
    previousDate: undefined,
  };
  assert.equal((await sendAppointmentEmail("appointment_pending", "patient@example.test", data)).status, "SENT");
  clinic = { name: "Clinic B & Partners", email: "b@example.test" };
  assert.equal((await sendAppointmentEmail("appointment_pending", "patient@example.test", data)).status, "SENT");
  assert.match(sent[0].html, /Clinic A/);
  assert.doesNotMatch(sent[0].html, /Clinic B/);
  assert.match(sent[1].html, /Clinic B &amp; Partners/);
  assert.doesNotMatch(sent[1].html, /Clinic A|Aether Dental|<img/);
  assert.match(sent[1].html, /&lt;img/);
  assert.match(sent[1].text, /Clinic B & Partners/);
  assert.equal(sent[0].replyTo, "a@example.test");
  assert.equal(sent[1].replyTo, "b@example.test");
  assert.deepEqual(sent[0].from, { name: "Clinic A", address: "no-reply@platform.example.test" });
  assert.deepEqual(sent[1].from, { name: "Clinic B & Partners", address: "no-reply@platform.example.test" });
  for (const invalidFrom of ["invalid", "first@example.test, second@example.test", "sender@example.test\r\nBcc: other@example.test"]) {
    process.env.SMTP_FROM = invalidFrom;
    assert.equal((await sendAppointmentEmail("appointment_pending", "patient@example.test", data)).status, "FAILED");
  }
  clinic = null;
  assert.equal((await sendAppointmentEmail("appointment_pending", "patient@example.test", data)).status, "FAILED");
  assert.equal(sent.length, 2);
  assert.deepEqual(logs.map((log) => log.status), ["SENT", "SENT", "FAILED", "FAILED", "FAILED", "FAILED"]);
  tenant.subscriptionMode = "TRIAL";
  tenant.subscriptionEndsAt = new Date(0);
  await assert.rejects(sendAppointmentEmail("appointment_pending", "patient@example.test", data), SubscriptionReadOnlyError);
  const { sendConfirmationEmail } = await import("../../src/lib/confirmations");
  await assert.rejects(sendConfirmationEmail("appointment", "staff"), SubscriptionReadOnlyError);
  assert.equal(sent.length, 2, "Expired helpers cannot send SMTP before a log write is denied");
  assert.equal(logs.length, 6, "Denied sends must not attempt delivery-history writes");
  clinic = { name: "Clinic A", email: "a@example.test" };
  process.env.SMTP_FROM = "no-reply@platform.example.test";
  tenant.subscriptionEndsAt = new Date("2099-01-01");
  expireDuringConfiguration = true;
  await assert.rejects(sendAppointmentEmail("appointment_pending", "patient@example.test", data), SubscriptionReadOnlyError);
  assert.equal(sent.length, 2, "Expiry during awaited configuration is rechecked immediately before SMTP");
  assert.equal(logs.length, 6);
});
