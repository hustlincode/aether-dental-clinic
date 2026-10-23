import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { prisma } from "../../src/lib/db";
import { appointmentTransaction, AppointmentError } from "../../src/lib/appointment-transaction";
import { isSlotAvailable } from "../../src/lib/scheduling";
import { updateClinicConfiguration, createClinicClosure, removeClinicClosure } from "../../src/lib/clinic-configuration";

test("Configuration preserves appointments and commits changes with their audit history", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async (t) => {
  assert.equal(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL);
  const url = new URL(process.env.DATABASE_URL!);
  assert(url.pathname.endsWith("_test") && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(await prisma.clinicSetting.count(), 0, "Use an empty disposable database.");
  const marker = randomUUID();
  const now = new Date("2099-01-05T02:00:00Z"); // 10 AM in Manila.
  const date = new Date("2099-01-05T00:00:00Z");
  const user = await prisma.user.create({ data: { name: marker, email: `${marker}@example.test`, passwordHash: "not-a-login", role: "ADMIN" } });
  const patient = await prisma.patient.create({ data: { firstName: marker, lastName: "Configuration", phone: "09123456789" } });
  const dentist = await prisma.dentist.create({ data: { name: marker, email: `dentist-${marker}@example.test`, specialization: "General", availability: { create: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].map(dayOfWeek => ({ dayOfWeek: dayOfWeek as "MONDAY", startTime: "09:00", endTime: "17:00" })) } } });
  const service = await prisma.service.create({ data: { name: marker, durationMin: 30, price: 500 } });
  await prisma.clinicSetting.create({ data: { id: "singleton", name: "Test", openingTime: "09:00", closingTime: "17:00" } });
  t.after(async () => {
    await prisma.activity.deleteMany({ where: { userId: user.id } });
    await prisma.appointment.deleteMany({ where: { dentistId: dentist.id } });
    await prisma.blockedDate.deleteMany({ where: { reason: { startsWith: marker } } });
    await prisma.availability.deleteMany({ where: { dentistId: dentist.id } });
    await prisma.dentist.delete({ where: { id: dentist.id } });
    await prisma.patient.delete({ where: { id: patient.id } });
    await prisma.service.delete({ where: { id: service.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.clinicSetting.delete({ where: { id: "singleton" } });
    await prisma.$disconnect();
  });
  const settings = () => prisma.clinicSetting.findUniqueOrThrow({ where: { id: "singleton" } });
  const hours = async (values = {}) => updateClinicConfiguration({ section: "hours", updatedAt: (await settings()).updatedAt.toISOString(), openingTime: "09:00", closingTime: "17:00", lunchBreakStart: null, lunchBreakEnd: null, ...values }, user.id, now);
  const appointment = (values = {}) => prisma.appointment.create({ data: { referenceNumber: `${marker}-${randomUUID()}`, appointmentDate: date, startTime: "11:00", endTime: "11:30", patientId: patient.id, dentistId: dentist.id, serviceId: service.id, ...values } });
  const conflict = (error: unknown) => error instanceof AppointmentError && error.status === 409;

  await t.test("stale forms cannot overwrite changes and failed audit inserts roll back", async () => {
    const original = await settings();
    await updateClinicConfiguration({ section: "contact", updatedAt: original.updatedAt.toISOString(), address: "Test address", phone: "09111111111", email: "clinic@example.test" }, user.id, now);
    await assert.rejects(updateClinicConfiguration({ section: "contact", updatedAt: original.updatedAt.toISOString(), address: "Stale", phone: null, email: null }, user.id, now), conflict);
    const before = await settings();
    const auditCount = await prisma.activity.count({ where: { userId: user.id } });
    await assert.rejects(updateClinicConfiguration({ section: "contact", updatedAt: before.updatedAt.toISOString(), address: "Must roll back", phone: null, email: null }, "missing-audit-user", now));
    assert.deepEqual(await settings(), before);
    assert.equal(await prisma.activity.count({ where: { userId: user.id } }), auditCount);
    await assert.rejects(createClinicClosure({ date: "2099-01-06", reason: marker }, "missing-audit-user", now));
    assert.equal(await prisma.blockedDate.count({ where: { date: new Date("2099-01-06"), dentistId: null } }), 0);
  });

  await t.test("live appointments block hours and closures while contact saves remain independent", async () => {
    for (const status of ["PENDING", "CONFIRMED", "CHECKED_IN"] as const) {
      const row = await appointment({ status });
      await assert.rejects(hours({ openingTime: "12:00" }), conflict);
      await assert.rejects(hours({ lunchBreakStart: "11:00", lunchBreakEnd: "12:00" }), conflict);
      await assert.rejects(createClinicClosure({ date: "2099-01-05", reason: marker }, user.id, now), conflict);
      await prisma.appointment.delete({ where: { id: row.id } });
    }
    const historical = await appointment({ startTime: "09:00", endTime: "09:30" });
    const completed = await appointment({ status: "COMPLETED" });
    await hours({ openingTime: "12:00" });
    const alreadyInvalid = await appointment();
    // Existing schedule inconsistencies must not block contact-only saves.
    const snapshot = await settings();
    await updateClinicConfiguration({ section: "contact", updatedAt: snapshot.updatedAt.toISOString(), address: null, phone: null, email: null }, user.id, now);
    assert.equal((await settings()).phone, null);
    await hours({ openingTime: "12:00" });
    await prisma.appointment.delete({ where: { id: alreadyInvalid.id } });
    const closure = await createClinicClosure({ date: "2099-01-05", reason: marker }, user.id, now);
    await assert.rejects(removeClinicClosure(closure.id, "missing-audit-user"));
    assert(await prisma.blockedDate.findUnique({ where: { id: closure.id } }));
    await removeClinicClosure(closure.id, user.id);
    await prisma.appointment.deleteMany({ where: { id: { in: [historical.id, completed.id] } } });
    await hours();
  });

  await t.test("the shipped partial index rejects clinic-wide duplicates at database level", async () => {
    // db push cannot represent partial indexes; execute the actual migration in this disposable database.
    const migrations = await readdir("prisma/migrations", { withFileTypes: true });
    const candidates = await Promise.all(migrations.filter(entry => entry.isDirectory()).map(async entry => ({ sql: await readFile(`prisma/migrations/${entry.name}/migration.sql`, "utf8") })));
    const migration = candidates.find(({ sql }) => /CREATE UNIQUE INDEX[\s\S]*blocked_dates[\s\S]*IS NULL/i.test(sql));
    assert(migration, "Clinic-wide closure uniqueness migration must exist.");
    const indexStatement = migration.sql.split(";").find(statement => /CREATE UNIQUE INDEX[\s\S]*IS NULL/i.test(statement));
    assert(indexStatement);
    const indexName = indexStatement.match(/CREATE UNIQUE INDEX(?: IF NOT EXISTS)?\s+"?([\w]+)"?/i)?.[1];
    assert(indexName);
    const existing = await prisma.$queryRaw<Array<{ indexname: string }>>`SELECT indexname FROM pg_indexes WHERE indexname = ${indexName}`;
    const preflight = migration.sql.match(/DO \$\$[\s\S]*?END \$\$;/)?.[0];
    assert(preflight, "Migration must check for existing duplicate clinic closures.");
    if (!existing.length) {
      const duplicateDate = new Date("2099-01-08");
      await prisma.blockedDate.createMany({ data: [0, 1].map(() => ({ date: duplicateDate, reason: marker })) });
      await assert.rejects(prisma.$executeRawUnsafe(preflight), /Duplicate clinic-wide closure dates/);
      assert.equal(await prisma.blockedDate.count({ where: { date: duplicateDate, reason: marker } }), 2, "Migration preflight must preserve duplicate rows for staff review.");
      await prisma.blockedDate.deleteMany({ where: { date: duplicateDate, reason: marker } });
      await prisma.$executeRawUnsafe(preflight);
      await prisma.$executeRawUnsafe(indexStatement);
    } else t.diagnostic("Partial index already applied; duplicate migration-preflight fixture cannot be inserted.");
    const day = new Date("2099-01-07");
    const outcomes = await Promise.allSettled(Array.from({ length: 4 }, () => prisma.blockedDate.create({ data: { date: day, reason: marker } })));
    assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1);
    await prisma.blockedDate.deleteMany({ where: { date: day, reason: marker } });
  });

  await t.test("concurrent booking and hours/closure edits never leave an invalid booking", async () => {
    for (let i = 0; i < 4; i++) {
      await hours();
      const raceDate = new Date(`2099-02-${String(i + 1).padStart(2, "0")}`);
      const book = () => appointmentTransaction(async tx => {
        if (!await isSlotAvailable(dentist.id, "09:00", "09:30", raceDate, undefined, tx)) throw new AppointmentError("Unavailable");
        return tx.appointment.create({ data: { referenceNumber: `${marker}-${randomUUID()}`, appointmentDate: raceDate, startTime: "09:00", endTime: "09:30", patientId: patient.id, dentistId: dentist.id, serviceId: service.id } });
      });
      const edit = i % 2 === 0 ? hours({ openingTime: "10:00" }) : createClinicClosure({ date: raceDate.toISOString().slice(0, 10), reason: marker }, user.id, now);
      const outcomes = await Promise.allSettled([book(), edit]);
      assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1, JSON.stringify(outcomes));
      const booked = await prisma.appointment.findFirst({ where: { dentistId: dentist.id, appointmentDate: raceDate } });
      if (booked) {
        assert.equal(await isSlotAvailable(dentist.id, booked.startTime, booked.endTime, raceDate, booked.id), true);
        await prisma.appointment.delete({ where: { id: booked.id } });
      }
      const closure = await prisma.blockedDate.findFirst({ where: { date: raceDate, reason: marker } });
      if (closure) await removeClinicClosure(closure.id, user.id);
    }
  });
});
