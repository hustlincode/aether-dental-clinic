import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, ClinicSetting } from "@prisma/client";
import { prisma } from "../../src/lib/db";
import { mockPrismaMethod } from "../helpers/mock-prisma";
import {
  configurationUpdateSchema, clinicClosureSchema, appointmentFitsHours,
  updateClinicConfiguration, createClinicClosure, removeClinicClosure, ConfigurationError,
} from "../../src/lib/clinic-configuration";

const now = new Date("2026-10-23T02:00:00Z"); // 10:00 Manila
const current: ClinicSetting = {
  id: "singleton", name: "Aether Dental", address: "Address", phone: null, email: null,
  openingTime: "09:00", closingTime: "17:00", lunchBreakStart: "12:00", lunchBreakEnd: "13:00",
  defaultDurationMin: 30, createdAt: now, updatedAt: now,
};
const contact = { section: "contact", updatedAt: now.toISOString(), address: "  ", phone: "123", email: "" };
const hours = { section: "hours", updatedAt: now.toISOString(), openingTime: "09:00", closingTime: "16:00", lunchBreakStart: "12:00", lunchBreakEnd: "13:00" };

test("configuration validates strict sections, clearable contact values, real dates and complete lunch intervals", () => {
  assert.deepEqual(configurationUpdateSchema.parse(contact), { ...contact, address: null, email: null });
  for (const body of [
    { ...contact, name: "Other clinic" }, { ...contact, email: "bad" }, { ...contact, updatedAt: "yesterday" },
    { ...hours, openingTime: "17:00" }, { ...hours, lunchBreakEnd: null },
    { ...hours, lunchBreakStart: "08:00" }, { ...hours, lunchBreakEnd: "24:00" },
    { ...hours, lunchBreakStart: "14:00", lunchBreakEnd: "13:00" },
  ]) assert.equal(configurationUpdateSchema.safeParse(body).success, false);
  assert.equal(configurationUpdateSchema.safeParse({ ...hours, lunchBreakStart: "", lunchBreakEnd: null }).success, true);
  assert.equal(clinicClosureSchema.safeParse({ date: "2026-02-29" }).success, false);
  assert.equal(clinicClosureSchema.safeParse({ date: "2028-02-29", dentistId: "dentist" }).success, false);
  assert.equal(clinicClosureSchema.parse({ date: "2028-02-29", reason: "  " }).reason, null);
});

test("hours allow boundary appointments and reject overlapping lunch or outside intervals", () => {
  assert.equal(appointmentFitsHours({ startTime: "09:00", endTime: "12:00" }, current), true);
  assert.equal(appointmentFitsHours({ startTime: "13:00", endTime: "17:00" }, current), true);
  assert.equal(appointmentFitsHours({ startTime: "11:30", endTime: "12:30" }, current), false);
  assert.equal(appointmentFitsHours({ startTime: "08:30", endTime: "09:30" }, current), false);
});

test("contact saves ignore legacy invalid hours, use conditional monotonic version and audit in the transaction", async (t) => {
  mockPrismaMethod(t, prisma, "$transaction", async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { isolationLevel: string }) => {
    assert.equal(options.isolationLevel, "Serializable");
    return work(prisma);
  });
  mockPrismaMethod(t, prisma.clinicSetting, "findUnique", async () => ({ ...current, openingTime: "invalid" }));
  const update = mockPrismaMethod(t, prisma.clinicSetting, "updateMany", async () => ({ count: 1 }));
  const audit = mockPrismaMethod(t, prisma.activity, "create", async () => ({}));
  const appointments = mockPrismaMethod(t, prisma.appointment, "findMany", async () => { throw new Error("contact must not query appointments"); });
  const result = await updateClinicConfiguration(contact, "admin", now);
  assert.equal(result.updatedAt, new Date(now.getTime() + 1).toISOString());
  assert.equal(result.address, null);
  assert.equal(appointments.mock.callCount(), 0);
  assert.equal(audit.mock.callCount(), 1);
  const args = update.mock.calls[0].arguments[0] as unknown as Prisma.ClinicSettingUpdateManyArgs;
  assert.deepEqual(args.where, { id: "singleton", updatedAt: now });
  await assert.rejects(updateClinicConfiguration({ ...contact, updatedAt: "2026-10-22T00:00:00Z" }, "admin", now), /Reload before saving/);
  assert.equal(update.mock.callCount(), 1);
  audit.mock.mockImplementation(async () => { throw new Error("audit failed"); });
  await assert.rejects(updateClinicConfiguration(contact, "admin", now), /audit failed/);
});

test("hours protect newly invalidated future, ongoing and overdue checked-in appointments without patient data", async (t) => {
  mockPrismaMethod(t, prisma, "$transaction", async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => work(prisma));
  mockPrismaMethod(t, prisma.clinicSetting, "findUnique", async () => current);
  const appointment = (id: string, startTime: string, endTime: string, status = "CONFIRMED") => ({
    id, referenceNumber: `REF-${id}`, appointmentDate: new Date("2026-10-23T00:00:00Z"), startTime, endTime, status,
  });
  mockPrismaMethod(t, prisma.appointment, "findMany", async () => [
    appointment("past", "09:00", "09:30"), appointment("overdue", "09:00", "09:30", "CHECKED_IN"),
    appointment("ongoing", "09:30", "10:30"), appointment("old-invalid", "08:00", "09:30"),
    appointment("safe", "11:00", "11:30"),
  ]);
  await assert.rejects(updateClinicConfiguration({ ...hours, openingTime: "10:30" }, "admin", now), (error: unknown) => {
    assert.ok(error instanceof ConfigurationError);
    assert.equal(error.status, 409);
    const details = error.details as { appointmentCount: number; appointments: { id: string }[] };
    assert.equal(details.appointmentCount, 2);
    assert.deepEqual(details.appointments.map((row) => row.id), ["overdue", "ongoing"]);
    assert.equal(JSON.stringify(details).includes("patient"), false);
    return true;
  });
});

test("closures reject remaining appointments and deletion is scoped to clinic-wide blocks", async (t) => {
  mockPrismaMethod(t, prisma, "$transaction", async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => work(prisma));
  const lookup = mockPrismaMethod(t, prisma.blockedDate, "findFirst", async () => null);
  mockPrismaMethod(t, prisma.appointment, "findMany", async () => [{ id: "ongoing", referenceNumber: "REF", appointmentDate: new Date("2026-10-23T00:00:00Z"), startTime: "09:30", endTime: "10:30", status: "PENDING" }]);
  await assert.rejects(createClinicClosure({ date: "2026-10-22" }, "admin", now), (error: unknown) => error instanceof ConfigurationError && error.status === 422);
  assert.equal(lookup.mock.callCount(), 0, "past dates must fail before database work");
  await assert.rejects(createClinicClosure({ date: "2026-10-23" }, "admin", now), /affected appointments/);
  await assert.rejects(removeClinicClosure("dentist-block", "admin"), (error: unknown) => error instanceof ConfigurationError && error.status === 404);
  assert.deepEqual(lookup.mock.calls[1].arguments[0], { where: { id: "dentist-block", dentistId: null } });
});
