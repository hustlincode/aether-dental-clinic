import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../../src/lib/db";
import { processUpcomingAppointmentReminders } from "../../src/lib/notifications";
import { mockPrismaMethod } from "../helpers/mock-prisma";

test("reminders batch dentist accounts, preserve recipients and use the clinic-local tomorrow", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-24T17:15:00Z") });
  const appointmentQuery = mockPrismaMethod(t, prisma.appointment, "findMany", async () => [
    { id: "a", startTime: "09:00", patient: { firstName: "Test", lastName: "One" }, dentist: { id: "profile" } },
    { id: "b", startTime: "10:00", patient: { firstName: "Test", lastName: "Two" }, dentist: { id: "profile" } },
    { id: "c", startTime: "11:00", patient: { firstName: "Test", lastName: "Three" }, dentist: { id: "missing-profile" } },
  ]);
  mockPrismaMethod(t, prisma.notification, "findMany", async () => [{ userId: "admin", entityId: "a" }]);
  const users = mockPrismaMethod(t, prisma.user, "findMany", async (...args: never[]) => {
    const query = args[0] as { where: { role?: unknown; active?: boolean; dentist?: { is: { id: { in: string[] } } } } };
    assert.equal(query.where.active, true);
    if (query.where.role !== "DENTIST") {
      return [{ id: "admin" }, { id: "reception" }];
    }
    assert.deepEqual(query.where.dentist?.is.id.in, ["profile", "missing-profile"]);
    return [{ id: "dentist", dentist: { id: "profile" } }];
  });
  const singleUser = mockPrismaMethod(t, prisma.user, "findFirst", async () => { throw new Error("Per-appointment account lookup must not run"); });
  const created: { userId: string; entityId: string; message: string }[] = [];
  mockPrismaMethod(t, prisma.notification, "createMany", async (...args: never[]) => {
    const { data } = args[0] as { data: typeof created };
    created.push(...data);
    return { count: data.length };
  });

  assert.deepEqual(await processUpcomingAppointmentReminders(), { checked: 3, created: 7 });
  assert.equal(users.mock.callCount(), 2, "Recipient queries must be constant regardless of appointment count");
  assert.equal(singleUser.mock.callCount(), 0);
  assert.deepEqual(created.map((row) => `${row.userId}:${row.entityId}`).sort(), ["reception:a", "dentist:a", "admin:b", "reception:b", "dentist:b", "admin:c", "reception:c"].sort());
  assert(created.every((row) => row.message.includes("tomorrow")));
  const query = appointmentQuery.mock.calls[0].arguments[0] as { where: { appointmentDate: { gte: Date; lt: Date } } };
  assert.equal(query.where.appointmentDate.gte.toISOString(), "2026-10-26T00:00:00.000Z");
  assert.equal(query.where.appointmentDate.lt.toISOString(), "2026-10-27T00:00:00.000Z");
});

test("no upcoming appointments skips recipient and write queries", async (t) => {
  mockPrismaMethod(t, prisma.appointment, "findMany", async () => []);
  const users = mockPrismaMethod(t, prisma.user, "findMany", async () => { throw new Error("Unnecessary recipient lookup"); });
  const writes = mockPrismaMethod(t, prisma.notification, "createMany", async () => { throw new Error("Unnecessary write"); });
  assert.deepEqual(await processUpcomingAppointmentReminders(), { checked: 0, created: 0 });
  assert.equal(users.mock.callCount(), 0);
  assert.equal(writes.mock.callCount(), 0);
});
