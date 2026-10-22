import assert from "node:assert/strict";
import test from "node:test";
import { mockPrismaMethod } from "../helpers/mock-prisma";
import { prisma } from "../../src/lib/db";
import { isSlotAvailable } from "../../src/lib/scheduling";

test("submission applies clinic hours, both breaks, overlaps, working days and blocks", async (t) => {

  const date = new Date("2099-01-05T00:00:00Z");
  const dayOfWeek = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(date).toUpperCase();
  const dentist = { status: "ACTIVE", availability: [{ dayOfWeek, startTime: "08:00", endTime: "18:00", breakStart: "14:00", breakEnd: "14:30", isWorking: true }] };
  const dentistQuery = mockPrismaMethod(t, prisma.dentist, "findUnique", async () => dentist as never);
  mockPrismaMethod(t, prisma.clinicSetting, "findUnique", async () => ({ openingTime: "09:00", closingTime: "17:00", lunchBreakStart: "12:00", lunchBreakEnd: "13:00" }) as never);
  const blocked = mockPrismaMethod(t, prisma.blockedDate, "findFirst", async () => null);
  const occupied = mockPrismaMethod(t, prisma.appointment, "findMany", async () => [{ startTime: "10:00", endTime: "11:00" }] as never);
  const available = (start: string, end: string) => isSlotAvailable("dentist", start, end, date);
  assert.equal(await available("09:00", "09:30"), true);
  for (const [start, end] of [["08:30", "09:00"], ["16:30", "17:30"], ["11:30", "12:30"], ["14:00", "14:30"], ["09:30", "10:30"], ["99:99", "10:00"], ["09:15", "09:45"]]) {
    assert.equal(await available(start, end), false, `${start}-${end} must be unavailable`);
  }
  await isSlotAvailable("dentist", "09:00", "09:30", date, "rescheduled-id");
  const query = occupied.mock.calls.at(-1)?.arguments[0] as unknown as { where: { id: unknown } };
  assert.deepEqual(query.where.id, { not: "rescheduled-id" });
  blocked.mock.mockImplementation(async () => ({ id: "block" }) as never);
  assert.equal(await available("09:00", "09:30"), false);
  blocked.mock.mockImplementation(async () => null);
  dentistQuery.mock.mockImplementation(async () => ({ ...dentist, status: "INACTIVE" }) as never);
  assert.equal(await available("09:00", "09:30"), false);
  dentistQuery.mock.mockImplementation(async () => ({ ...dentist, availability: [{ ...dentist.availability[0], isWorking: false }] }) as never);
  assert.equal(await available("09:00", "09:30"), false);
});


