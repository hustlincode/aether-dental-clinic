import assert from "node:assert/strict";
import test from "node:test";
import { mockPrismaMethod } from "../helpers/mock-prisma";
import { prisma } from "../../src/lib/db";
import { getAvailableDates, getAvailableSlots, isSlotAvailable } from "../../src/lib/scheduling";
import type { Prisma } from "@prisma/client";

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

test("date availability starts range reads together and excludes blocked, full and non-working dates", async (t) => {
  const started: string[] = [];
  let releaseDentist!: () => void;
  const dentistReady = new Promise<void>((resolve) => { releaseDentist = resolve; });
  const dayName = (key: string) => new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" })
    .format(new Date(`${key}T00:00:00Z`)).toUpperCase();
  const dentist = { status: "ACTIVE", availability: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].map(dayOfWeek => ({
    dayOfWeek, startTime: "08:00", endTime: "18:00", breakStart: "14:00", breakEnd: "14:30", isWorking: dayOfWeek !== dayName("2099-01-07"),
  })) };
  const dentistQuery = mockPrismaMethod(t, prisma.dentist, "findUnique", async () => { started.push("dentist"); await dentistReady; return dentist; });
  const clinicQuery = mockPrismaMethod(t, prisma.clinicSetting, "findUnique", async () => {
    started.push("clinic"); return { openingTime: "09:00", closingTime: "17:00", lunchBreakStart: "12:00", lunchBreakEnd: "13:00" };
  });
  const blocked = mockPrismaMethod(t, prisma.blockedDate, "findMany", async () => {
    started.push("blocked"); return [{ date: new Date("2099-01-06T00:00:00Z") }];
  });
  const occupied = mockPrismaMethod(t, prisma.appointment, "findMany", async () => {
    started.push("appointments"); return [{ appointmentDate: new Date("2099-01-05T00:00:00Z"), startTime: "09:00", endTime: "17:00" }];
  });
  const pending = getAvailableDates("dentist", { id: "service", durationMin: 30 }, new Date("2099-01-05T00:00:00Z"), 6);
  try { assert.deepEqual(started, ["dentist", "clinic", "blocked", "appointments"]); }
  finally { releaseDentist(); }
  assert.deepEqual(await pending, ["2099-01-08", "2099-01-09", "2099-01-10"]);
  const blockQuery = blocked.mock.calls[0].arguments[0] as { where: { OR: unknown; date: { gte: Date; lte: Date } } };
  assert.deepEqual(blockQuery.where.OR, [{ dentistId: "dentist" }, { dentistId: null }]);
  assert.equal(blockQuery.where.date.lte.toISOString(), "2099-01-10T23:59:59.999Z");
  const appointmentQuery = occupied.mock.calls[0].arguments[0] as { where: { status: unknown }; select: unknown };
  assert.deepEqual(appointmentQuery.where.status, { notIn: ["CANCELLED", "NO_SHOW"] });
  assert.deepEqual(appointmentQuery.select, { appointmentDate: true, startTime: true, endTime: true });
  dentistQuery.mock.mockImplementation(async () => ({ ...dentist, status: "INACTIVE" }));
  assert.deepEqual(await getAvailableDates("dentist", { id: "service", durationMin: 30 }, new Date("2099-01-05T00:00:00Z"), 1), []);
  dentistQuery.mock.mockImplementation(async () => dentist);
  clinicQuery.mock.mockImplementation(async () => null);
  assert.deepEqual(await getAvailableDates("dentist", { id: "service", durationMin: 30 }, new Date("2099-01-05T00:00:00Z"), 1), []);
});

test("slot reads start together on the supplied transaction client and retain exclusion rules", async (t) => {
  const globalLookup = mockPrismaMethod(t, prisma.dentist, "findUnique", async () => { throw new Error("must use transaction client"); });
  const started: string[] = [];
  let releaseDentist!: () => void;
  const dentistReady = new Promise<void>((resolve) => { releaseDentist = resolve; });
  const date = new Date("2099-01-05T00:00:00Z");
  const dayOfWeek = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(date).toUpperCase();
  let appointmentQuery: unknown;
  const tx = {
    dentist: { findUnique: async () => {
      started.push("dentist"); await dentistReady;
      return { status: "ACTIVE", availability: [{ dayOfWeek, startTime: "09:00", endTime: "10:00", breakStart: null, breakEnd: null, isWorking: true }] };
    } },
    clinicSetting: { findUnique: async () => { started.push("clinic"); return { openingTime: "09:00", closingTime: "17:00", lunchBreakStart: null, lunchBreakEnd: null }; } },
    blockedDate: { findFirst: async () => { started.push("blocked"); return null; } },
    appointment: { findMany: async (query: unknown) => { started.push("appointments"); appointmentQuery = query; return [{ startTime: "09:00", endTime: "09:30" }]; } },
  } as unknown as Prisma.TransactionClient;
  const pending = getAvailableSlots("dentist", { id: "service", durationMin: 30 }, date, "moving-appointment", tx);
  try { assert.deepEqual(started, ["dentist", "clinic", "blocked", "appointments"]); }
  finally { releaseDentist(); }
  assert.deepEqual(await pending, [{ start: "09:30", end: "10:00" }]);
  assert.deepEqual((appointmentQuery as { where: { id: unknown } }).where.id, { not: "moving-appointment" });
  assert.equal(globalLookup.mock.callCount(), 0);
});


