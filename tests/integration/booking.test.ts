import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prisma } from "../../src/lib/db";
import { mockModuleExports } from "../helpers/mock-module";

test("PostgreSQL prevents concurrent overlapping bookings, preserves identity and rolls back failed audit writes", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async (t) => {
  assert.equal(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL);
  assert(new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"));
  assert.equal(await prisma.clinicSetting.count(), 0, "Use an empty disposable database; existing clinic data must never be replaced.");
  const marker = randomUUID();
  const date = "2099-01-05";
  const staff = await prisma.user.create({ data: { name: marker, email: `${marker}@example.test`, passwordHash: "not-a-login", role: "ADMIN" } });
  const dentist = await prisma.dentist.create({ data: { name: marker, email: `dentist-${marker}@example.test`, specialization: "General", availability: { create: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].map(dayOfWeek => ({ dayOfWeek: dayOfWeek as "MONDAY", startTime: "09:00", endTime: "17:00" })) } } });
  const service = await prisma.service.create({ data: { name: marker, durationMin: 30, price: 500 } });
  await prisma.clinicSetting.create({ data: { id: "singleton", name: "Test", openingTime: "09:00", closingTime: "17:00" } });
  const victim = await prisma.patient.create({ data: { firstName: marker, lastName: "Existing", email: "private@example.test", phone: "09123456789" } });
  t.after(async () => {
    const appointments = await prisma.appointment.findMany({ where: { dentistId: dentist.id }, select: { id: true } });
    await prisma.activity.deleteMany({ where: { entityId: { in: appointments.map(a => a.id) } } });
    const patients = await prisma.patient.findMany({ where: { firstName: marker }, select: { id: true } });
    await prisma.activity.deleteMany({ where: { entityId: { in: patients.map(patient => patient.id) } } });
    await prisma.appointment.deleteMany({ where: { dentistId: dentist.id } });
    await prisma.patient.deleteMany({ where: { firstName: marker } });
    await prisma.availability.deleteMany({ where: { dentistId: dentist.id } });
    await prisma.dentist.delete({ where: { id: dentist.id } });
    await prisma.service.delete({ where: { id: service.id } });
    await prisma.user.delete({ where: { id: staff.id } });
    await prisma.clinicSetting.delete({ where: { id: "singleton" } });
    await prisma.$disconnect();
  });
  let authenticatedId = staff.id;
  mockModuleExports(t, require.resolve("../../src/lib/api"), {
    getSessionUser: async () => null,
    requireWriteAuth: async () => ({ user: { id: authenticatedId, name: "Staff", role: "ADMIN" }, error: null }),
    requireWriteRole: async () => ({ user: { id: authenticatedId, name: "Staff", role: "ADMIN" }, error: null }),
  });
  mockModuleExports(t, require.resolve("../../src/lib/email"), { sendAppointmentEmail: async () => ({ ok: false, status: "SKIPPED" }) });
  mockModuleExports(t, require.resolve("../../src/lib/notifications"), { notifyAppointmentCreated: async () => undefined, notifyAppointmentCancelled: async () => undefined, notifyAppointmentRescheduled: async () => undefined });
  mockModuleExports(t, require.resolve("../../src/lib/home-cache"), { revalidateHomepage: () => undefined });
  const { POST } = await import("../../src/app/api/appointments/route");
  const { PATCH } = await import("../../src/app/api/appointments/[id]/status/route");
  const { PATCH: reschedule } = await import("../../src/app/api/appointments/[id]/route");
  const { POST: createPatient } = await import("../../src/app/api/patients/route");
  const { PATCH: updatePatient } = await import("../../src/app/api/patients/[id]/route");
  const { PATCH: patientStatus } = await import("../../src/app/api/patients/[id]/status/route");
  const book = (startTime: string) => POST(new Request("http://localhost/api/appointments", { method: "POST", body: JSON.stringify({ serviceId: service.id, dentistId: dentist.id, date, startTime, firstName: marker, lastName: "New", email: "private@example.test", phone: "09123456789", dataPrivacyConsent: true, dataPrivacySignature: `${marker} New` }) }));
  const responses = await Promise.all(Array.from({ length: 8 }, () => book("09:00")));
  const outcomes = await Promise.all(responses.map(async response => ({ status: response.status, body: await response.clone().json() })));
  assert.equal(responses.filter(response => response.status === 201).length, 1, JSON.stringify(outcomes));
  assert.equal(responses.filter(response => response.status === 409).length, 7);
  const active = await prisma.appointment.findMany({ where: { dentistId: dentist.id } });
  assert.equal(active.length, 1);
  assert.notEqual(active[0].patientId, victim.id);
  const adjacent = await Promise.all([book("09:30"), book("10:00")]);
  assert(adjacent.every(response => response.status === 201));
  const references = await prisma.appointment.findMany({ where: { dentistId: dentist.id }, select: { referenceNumber: true } });
  assert.equal(new Set(references.map(a => a.referenceNumber)).size, 3);
  const move = (id: string, startTime: string, patient?: { firstName: string }) => reschedule(new Request("http://localhost/api/appointments/id", { method: "PATCH", body: JSON.stringify({ startTime, ...(patient ? { patient } : {}) }) }), { params: Promise.resolve({ id }) });
  const race = await Promise.all([move(active[0].id, "11:00"), book("11:00")]);
  assert.equal(race.filter(response => response.status === 409).length, 1);
  assert.equal(race.filter(response => [200, 201].includes(response.status)).length, 1);
  const toMove = await prisma.appointment.findMany({ where: { dentistId: dentist.id }, take: 2 });
  const moveRace = await Promise.all(toMove.map(row => move(row.id, "13:00")));
  assert.equal(moveRace.filter(response => response.status === 200).length, 1);
  assert.equal(moveRace.filter(response => response.status === 409).length, 1);
  const rows = await prisma.appointment.findMany({ where: { dentistId: dentist.id, status: { notIn: ["CANCELLED", "NO_SHOW"] } } });
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    assert.equal(rows[i].startTime < rows[j].endTime && rows[i].endTime > rows[j].startTime, false, "active intervals must never overlap");
  }
  const changeStatus = (status: string) => PATCH(new Request("http://localhost/api/status", { method: "PATCH", body: JSON.stringify({ status }) }), { params: Promise.resolve({ id: active[0].id }) });
  authenticatedId = "missing-user-for-audit-fk";
  const patientsBefore = await prisma.patient.count();
  assert.equal((await createPatient(new Request("http://localhost/api/patients", { method: "POST", body: JSON.stringify({ firstName: marker, lastName: "Rollback", phone: "09111111111" }) }))).status, 500);
  assert.equal(await prisma.patient.count(), patientsBefore);
  assert.equal((await updatePatient(new Request("http://localhost/api/patients/id", { method: "PATCH", body: JSON.stringify({ phone: "09999999999" }) }), { params: Promise.resolve({ id: victim.id }) })).status, 500);
  assert.equal((await prisma.patient.findUniqueOrThrow({ where: { id: victim.id } })).phone, "09123456789");
  const changePatientStatus = () => patientStatus(new Request("http://localhost/api/patients/id/status", { method: "PATCH", body: JSON.stringify({ status: "INACTIVE" }) }), { params: Promise.resolve({ id: victim.id }) });
  assert.equal((await changePatientStatus()).status, 500);
  assert.equal((await prisma.patient.findUniqueOrThrow({ where: { id: victim.id } })).status, "ACTIVE");
  const before = await prisma.patient.findUniqueOrThrow({ where: { id: active[0].patientId } });
  assert.equal((await move(active[0].id, rows.find(row => row.id === active[0].id)!.startTime, { firstName: "Should roll back" })).status, 500);
  assert.equal((await prisma.patient.findUniqueOrThrow({ where: { id: active[0].patientId } })).firstName, before.firstName);
  assert.equal((await changeStatus("CANCELLED")).status, 500);
  assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: active[0].id } })).status, "PENDING");
  authenticatedId = staff.id;
  assert.equal((await changePatientStatus()).status, 200);
  const patientActivityCount = await prisma.activity.count({ where: { entityId: victim.id } });
  assert.equal((await changePatientStatus()).status, 200);
  assert.equal(await prisma.activity.count({ where: { entityId: victim.id } }), patientActivityCount);
  assert.equal((await changeStatus("CANCELLED")).status, 200);
  const count = await prisma.activity.count({ where: { entityId: active[0].id } });
  assert.equal((await changeStatus("CANCELLED")).status, 200);
  assert.equal(await prisma.activity.count({ where: { entityId: active[0].id } }), count);
  assert.equal((await changeStatus("CONFIRMED")).status, 409);
});
