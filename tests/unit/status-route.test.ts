import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { prisma } from "../../src/lib/db";
import { mockModuleExports } from "../helpers/mock-module";
import { mockPrismaMethod } from "../helpers/mock-prisma";

test("repeated status updates do not repeat writes, audit, notifications or email; terminal cannot reactivate", async (t) => {
  mockModuleExports(t, require.resolve("../../src/lib/api"), { requireWriteAuth: async () => ({ user: { id: "staff", name: "Staff", role: "ADMIN" }, error: null }) });
  const sendEmail = mock.fn(async () => ({ ok: true, status: "SENT" }));
  const notify = mock.fn(async () => undefined);
  mockModuleExports(t, require.resolve("../../src/lib/email"), { sendAppointmentEmail: sendEmail });
  mockModuleExports(t, require.resolve("../../src/lib/notifications"), { notifyAppointmentCancelled: notify });
  const { PATCH } = await import("../../src/app/api/appointments/[id]/status/route");
  const appointment = { id: "appointment", status: "PENDING", referenceNumber: "APT-test", appointmentDate: new Date("2099-01-05T00:00:00Z"), startTime: "09:00", patient: { firstName: "Test", lastName: "Patient", email: "test@example.test" }, service: { name: "Cleaning" }, dentist: { name: "Dr Test" } };
  mockPrismaMethod(t, prisma.appointment, "findUnique", async () => appointment);
  const update = mockPrismaMethod(t, prisma.appointment, "update", async (query: { data: { status: string } }) => { appointment.status = query.data.status; return appointment; });
  const activity = mockPrismaMethod(t, prisma.activity, "create", async () => ({}));
  mockPrismaMethod(t, prisma, "$transaction", async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma));
  const patch = (status: string) => PATCH(new Request("http://localhost/api/appointments/appointment/status", { method: "PATCH", body: JSON.stringify({ status }) }), { params: Promise.resolve({ id: "appointment" }) });
  assert.equal((await patch("CANCELLED")).status, 200);
  assert.equal((await patch("CANCELLED")).status, 200);
  assert.equal(update.mock.callCount(), 1);
  assert.equal(activity.mock.callCount(), 1);
  assert.equal(sendEmail.mock.callCount(), 1);
  assert.equal(notify.mock.callCount(), 1);
  assert.equal((await patch("CONFIRMED")).status, 409);
  assert.equal(update.mock.callCount(), 1);
});
