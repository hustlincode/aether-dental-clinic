import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../../src/lib/db";
import { getDentistUserId, notifyAppointmentCancelled } from "../../src/lib/notifications";
import { mockPrismaMethod } from "../helpers/mock-prisma";

test("Dentist notification targets require an active linked Dentist-role account", async (t) => {
  const lookup = mockPrismaMethod(t, prisma.user, "findFirst", async () => ({ id: "linked-account" }));
  assert.equal(await getDentistUserId("clinical-profile"), "linked-account");
  assert.deepEqual(lookup.mock.calls[0].arguments[0], {
    where: { active: true, role: "DENTIST", dentist: { is: { id: "clinical-profile" } } },
    select: { id: true },
  });
  lookup.mock.mockImplementation(async () => null as never);
  assert.equal(await getDentistUserId("unlinked-or-inactive"), null);
});

test("appointment events resolve recipients by clinical id regardless of profile email", async (t) => {
  mockPrismaMethod(t, prisma.user, "findMany", async () => []);
  const lookup = mockPrismaMethod(t, prisma.user, "findFirst", async () => ({ id: "linked-account" }));
  const writes = mockPrismaMethod(t, prisma.notification, "createMany", async () => ({ count: 1 }));
  await notifyAppointmentCancelled({
    id: "appointment", referenceNumber: "REF", appointmentDate: new Date("2099-01-05T00:00:00Z"), startTime: "09:00",
    patient: { firstName: "Test", lastName: "Patient" },
    dentist: { id: "clinical-profile", name: "Dr Test", email: "changed@example.test" }, service: { name: "Cleaning" },
  });
  const lookupQuery = lookup.mock.calls[0].arguments[0] as { where: { dentist: { is: { id: string } } } };
  assert.equal(lookupQuery.where.dentist.is.id, "clinical-profile");
  const written = writes.mock.calls[0].arguments[0] as { data: { userId: string }[] };
  assert.deepEqual(written.data.map((row) => row.userId), ["linked-account"]);
});
