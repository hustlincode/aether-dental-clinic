import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { prisma } from "../../src/lib/db";
import { mockModuleExports } from "../helpers/mock-module";
import { mockPrismaMethod } from "../helpers/mock-prisma";

test("assistants edit only notes and advance clinical statuses without repeated side effects", async (t) => {
  let user = { id: "assistant", name: "Assistant", role: "ASSISTANT", email: "assistant@example.test", isDemo: false };
  mockModuleExports(t, require.resolve("../../src/lib/api"), { requireTenantWrite: async () => null,
    requireWriteAuth: async () => ({ user, error: null }),
    getSessionUser: async () => user,
  });
  const notify = mock.fn(async () => undefined);
  const email = mock.fn(async () => ({ ok: true, status: "SENT" }));
  mockModuleExports(t, require.resolve("../../src/lib/email"), { sendAppointmentEmail: email });
  mockModuleExports(t, require.resolve("../../src/lib/notifications"), {
    notifyPatientCheckedIn: notify, notifyAppointmentCompleted: notify, notifyAppointmentRescheduled: notify,
  });
  const appointment = {
    id: "appointment", dentistId: "dentist", patientId: "patient", serviceId: "service",
    status: "CONFIRMED", referenceNumber: "APT-test", notes: null as string | null,
    appointmentDate: new Date("2099-01-05T00:00:00Z"), startTime: "09:00", endTime: "09:30",
    patient: { firstName: "Test", lastName: "Patient", email: "patient@example.test" },
    dentist: { id: "dentist", name: "Dr Test" }, service: { name: "Cleaning", status: "ACTIVE" },
  };
  const read = mockPrismaMethod(t, prisma.appointment, "findUnique", async () => appointment);
  const write = mockPrismaMethod(t, prisma.appointment, "update", async (args: { data: { status?: string; notes?: string | null } }) => {
    Object.assign(appointment, args.data); return appointment;
  });
  const audit = mockPrismaMethod(t, prisma.activity, "create", async () => ({}));
  const patientWrite = mockPrismaMethod(t, prisma.patient, "update", async () => { throw new Error("Unexpected patient write"); });
  mockPrismaMethod(t, prisma, "$transaction", async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma));
  let linkedUserId: unknown;
  mockPrismaMethod(t, prisma.dentist, "findFirst", async (args: { where: { userId?: string } }) => {
    linkedUserId = args.where.userId; return { id: "dentist" };
  });
  const { PATCH: edit } = await import("../../src/app/api/appointments/[id]/route");
  const { PATCH: status } = await import("../../src/app/api/appointments/[id]/status/route");
  const { POST: book } = await import("../../src/app/api/appointments/route");
  const params = { params: Promise.resolve({ id: "appointment" }) };
  const request = (body: unknown) => new Request("http://localhost/api/appointments/appointment", { method: "PATCH", body: JSON.stringify(body) });

  assert.equal((await book(request({}))).status, 403);
  assert.equal(read.mock.callCount(), 0);
  for (const body of [{ startTime: "10:00" }, { serviceId: "other" }, { dentistId: "other" }, { patient: { firstName: "Changed" } }, { notes: "note", appointmentDate: "2099-01-06" }]) {
    assert.equal((await edit(request(body), params)).status, 403);
  }
  assert.equal((await edit(request({ notes: "note", unexpected: true }), params)).status, 422);
  assert.equal((await edit(request({}), params)).status, 422);
  assert.equal(write.mock.callCount(), 0);
  assert.equal((await edit(request({ notes: "  Clinical note  " }), params)).status, 200);
  assert.equal(appointment.notes, "Clinical note");
  assert.equal(patientWrite.mock.callCount(), 0);
  for (const next of ["CONFIRMED", "CANCELLED", "NO_SHOW"]) {
    assert.equal((await status(request({ status: next }), params)).status, 403);
  }
  assert.equal((await status(request({ status: "COMPLETED" }), params)).status, 409);
  assert.equal((await status(request({ status: "CHECKED_IN" }), params)).status, 200);
  const writes = write.mock.callCount();
  const audits = audit.mock.callCount();
  assert.equal((await status(request({ status: "CHECKED_IN" }), params)).status, 200);
  assert.equal(write.mock.callCount(), writes);
  assert.equal(audit.mock.callCount(), audits);
  assert.equal(notify.mock.callCount(), 1);
  assert.equal((await status(request({ status: "COMPLETED" }), params)).status, 200);
  assert.equal(notify.mock.callCount(), 2);
  assert.equal(email.mock.callCount(), 0);

  user = { ...user, id: "dentist-user", role: "DENTIST", email: "changed@example.test" };
  assert.equal((await edit(request({ notes: null }), params)).status, 200);
  assert.equal(linkedUserId, "dentist-user");
  appointment.dentistId = "someone-else";
  assert.equal((await edit(request({ notes: "wrong owner" }), params)).status, 403);
  assert.equal((await status(request({ status: "COMPLETED" }), params)).status, 403);
  user = { ...user, role: "ADMIN", isDemo: true };
  assert.equal((await book(request({}))).status, 403);
});
