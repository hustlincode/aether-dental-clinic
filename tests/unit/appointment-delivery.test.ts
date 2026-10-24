import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { mockModuleExports } from "../helpers/mock-module";

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("appointment delivery runs independent post-commit work together and awaits actual outcomes", async (t) => {
  t.mock.method(console, "error", () => {});
  const appointment = {
    id: "appointment", referenceNumber: "APT-test", appointmentDate: new Date("2099-01-05T00:00:00Z"),
    startTime: "09:00", endTime: "09:30", status: "PENDING", dentistId: "dentist", serviceId: "service",
    patient: { id: "patient", firstName: "Test", lastName: "Patient", email: "test@example.test" },
    service: { name: "Cleaning", status: "ACTIVE", durationMin: 30 }, dentist: { name: "Dr Test", email: "dentist@example.test" },
  };
  let transactionResult: unknown;
  let committed = false;
  let delivery: {
    emailStarted: ReturnType<typeof signal>; notificationStarted: ReturnType<typeof signal>;
    releaseEmail: ReturnType<typeof signal>; releaseNotification: ReturnType<typeof signal>;
    emailFails: boolean; notificationFails: boolean;
  };
  const sendEmail = mock.fn(async () => {
    assert.equal(committed, true);
    delivery.emailStarted.resolve();
    await delivery.releaseEmail.promise;
    if (delivery.emailFails) throw new Error("SMTP unavailable");
    return { ok: true, status: "SENT" };
  });
  const notify = mock.fn(async () => {
    assert.equal(committed, true);
    delivery.notificationStarted.resolve();
    await delivery.releaseNotification.promise;
    if (delivery.notificationFails) throw new Error("Notification unavailable");
  });
  mockModuleExports(t, require.resolve("../../src/lib/api"), {
    getSessionUser: async () => null,
    requireWriteAuth: async () => ({ user: { id: "staff", name: "Staff", role: "ADMIN" }, error: null }),
  });
  mockModuleExports(t, require.resolve("../../src/lib/reference"), { generateAppointmentReference: async () => "APT-test" });
  mockModuleExports(t, require.resolve("../../src/lib/appointment-transaction"), {
    appointmentTransaction: async () => { committed = true; return transactionResult; },
  });
  mockModuleExports(t, require.resolve("../../src/lib/email"), { sendAppointmentEmail: sendEmail });
  mockModuleExports(t, require.resolve("../../src/lib/notifications"), {
    notifyAppointmentCreated: notify, notifyAppointmentRescheduled: notify, notifyAppointmentCancelled: notify,
    notifyAppointmentConfirmed: notify, notifyPatientCheckedIn: notify, notifyAppointmentCompleted: notify,
  });
  mockModuleExports(t, require.resolve("../../src/lib/home-cache"), { revalidateHomepage: () => undefined });
  const booking = await import("../../src/app/api/appointments/route");
  const reschedule = await import("../../src/app/api/appointments/[id]/route");
  const status = await import("../../src/app/api/appointments/[id]/status/route");
  const params = { params: Promise.resolve({ id: "appointment" }) };
  const flows = [
    { name: "booking", result: appointment, expectedStatus: 201, call: () => booking.POST(new Request("http://localhost/api/appointments", {
      method: "POST", body: JSON.stringify({ serviceId: "service", dentistId: "dentist", date: "2099-01-05", startTime: "09:00", firstName: "Test", lastName: "Patient",
        email: "test@example.test", phone: "09123456789", dataPrivacyConsent: true, dataPrivacySignature: "Test Patient" }),
    })) },
    { name: "reschedule", result: { updated: { ...appointment, startTime: "09:30", endTime: "10:00" }, existing: appointment, scheduleChanged: true }, expectedStatus: 200,
      call: () => reschedule.PATCH(new Request("http://localhost/api/appointments/appointment", { method: "PATCH", body: JSON.stringify({ startTime: "09:30" }) }), params) },
    { name: "status change", result: { updated: { ...appointment, status: "CANCELLED" }, changed: true }, expectedStatus: 200,
      call: () => status.PATCH(new Request("http://localhost/api/appointments/appointment/status", { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) }), params) },
  ];

  for (const flow of flows) {
    for (const emailFails of [false, true]) {
      await t.test(`${flow.name}: ${emailFails ? "email failure" : "notification failure"} does not lose the committed operation`, { timeout: 2000 }, async () => {
        committed = false;
        transactionResult = flow.result;
        delivery = { emailStarted: signal(), notificationStarted: signal(), releaseEmail: signal(), releaseNotification: signal(), emailFails, notificationFails: !emailFails };
        let responded = false;
        const pending = flow.call().then(response => { responded = true; return response; });
        await Promise.all([delivery.emailStarted.promise, delivery.notificationStarted.promise]);
        assert.equal(responded, false);
        delivery.releaseEmail.resolve();
        await new Promise<void>(resolve => setImmediate(resolve));
        assert.equal(responded, false, "the handler must await notification work too");
        delivery.releaseNotification.resolve();
        const response = await pending;
        assert.equal(response.status, flow.expectedStatus);
        const body = await response.json();
        assert.equal(body.success, true);
        assert.deepEqual(flow.name === "booking" ? body.data.email : body.email,
          emailFails ? { ok: false, status: "FAILED" } : { ok: true, status: "SENT" });
      });
    }
  }

  const emailsBefore = sendEmail.mock.callCount();
  const notificationsBefore = notify.mock.callCount();
  transactionResult = { updated: appointment, existing: appointment, scheduleChanged: false };
  const unchangedSchedule = await reschedule.PATCH(new Request("http://localhost/api/appointments/appointment", { method: "PATCH", body: JSON.stringify({ notes: "Notes only" }) }), params);
  assert.equal((await unchangedSchedule.json()).email, null);
  transactionResult = { updated: appointment, changed: false };
  const unchangedStatus = await status.PATCH(new Request("http://localhost/api/appointments/appointment/status", { method: "PATCH", body: JSON.stringify({ status: "PENDING" }) }), params);
  assert.equal((await unchangedStatus.json()).email, null);
  assert.equal(sendEmail.mock.callCount(), emailsBefore);
  assert.equal(notify.mock.callCount(), notificationsBefore);
});
