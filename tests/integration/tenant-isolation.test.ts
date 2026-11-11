import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { rawPrisma } from "../../src/lib/raw-db";
import { prisma } from "../../src/lib/db";
import { withTenantContext, getRequestTenant } from "../../src/lib/tenant";
import { mockModuleExports } from "../helpers/mock-module";

test("two clinics isolate API records, booking, scheduling, recipients and delivery", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async t => {
  assert.equal(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL);
  const target = new URL(process.env.TEST_DATABASE_URL!);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) && target.pathname.endsWith("_test"));
  const tenants = await Promise.all(["a", "b"].map(suffix => rawPrisma.tenant.create({ data: { slug: `isolation-${suffix}-${randomUUID()}`, name: `Clinic ${suffix}` } })));
  const run = <T>(index: number, work: () => Promise<T>) => withTenantContext(tenants[index], work);
  t.after(async () => {
    for (const tenant of tenants) {
      for (const model of ["confirmationEmail", "notification", "activity", "emailLog", "appointment", "availability", "blockedDate", "dentist", "patient", "service", "clinicSetting", "user"] as const) {
        const remove = rawPrisma[model].deleteMany as unknown as (args: { where: { tenantId: string } }) => Promise<unknown>;
        await remove({ where: { tenantId: tenant.id } });
      }
      await rawPrisma.tenant.delete({ where: { id: tenant.id } });
    }
    await rawPrisma.$disconnect();
  });
  const fixtures = await Promise.all(tenants.map((_, index) => run(index, async () => {
    const user = await prisma.user.create({ data: { name: "Owner", email: "owner@example.test", passwordHash: "not-a-login", role: "ADMIN" } });
    const dentist = await prisma.dentist.create({ data: { name: "Dentist", email: "dentist@example.test", specialization: "General" } });
    const service = await prisma.service.create({ data: { name: "Consultation", durationMin: 30, price: 500 } });
    const patient = await prisma.patient.create({ data: { firstName: `Clinic ${index}`, lastName: "Patient", phone: "test-only" } });
    await prisma.clinicSetting.create({ data: { name: tenants[index].name, openingTime: "09:00", closingTime: "17:00" } });
    await prisma.availability.createMany({ data: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map(day => ({ dentistId: dentist.id, dayOfWeek: day as "MONDAY", startTime: "09:00", endTime: "17:00" })) });
    return { user, dentist, service, patient };
  })));
  const actor = async () => {
    const tenant = await getRequestTenant();
    return fixtures[tenants.findIndex(row => row.id === tenant.id)].user;
  };
  mockModuleExports(t, require.resolve("../../src/lib/api"), {
    getSessionUser: async () => null,
    requireAuth: async () => ({ user: { ...await actor(), isDemo: false }, error: null }),
    requireWriteAuth: async () => ({ user: await actor(), error: null }),
    requireWriteRole: async () => ({ user: await actor(), error: null }),
  });
  let sent = 0;
  mockModuleExports(t, require.resolve("../../src/lib/home-cache"), { revalidateHomepage: () => undefined });
  mockModuleExports(t, require.resolve("../../src/lib/email"), { sendAppointmentEmail: async () => { sent++; return { ok: false, status: "SKIPPED" }; } });
  const { POST: book } = await import("../../src/app/api/appointments/route");
  const { GET: patientDetail, PATCH: updatePatient } = await import("../../src/app/api/patients/[id]/route");
  const { GET: appointments } = await import("../../src/app/api/appointments/route");
  const { POST: confirm } = await import("../../src/app/api/appointments/[id]/confirmation-email/route");
  const { GET: clinicInfo } = await import("../../src/app/api/clinic/route");
  const { DELETE: deleteService } = await import("../../src/app/api/services/[id]/route");
  const { isSlotAvailable } = await import("../../src/lib/scheduling");
  const { createClinicClosure } = await import("../../src/lib/clinic-configuration");
  const { getUsersByRole, processUpcomingAppointmentReminders, getUnreadCount } = await import("../../src/lib/notifications");
  const { clinicDateKey, addDaysToKey, dateKeyToUtc } = await import("../../src/lib/clinic-time");
  const { createUser } = await import("../../src/lib/user-management");
  const request = (body: unknown) => new Request("http://clinic.localhost/api", { method: "POST", body: JSON.stringify(body) });
  const booking = (index: number, foreign = false, time = "09:00") => run(index, () => book(request({
    serviceId: fixtures[foreign ? 1 - index : index].service.id, dentistId: fixtures[index].dentist.id,
    date: "2099-01-05", startTime: time, firstName: "Public", lastName: "Request", email: "patient@example.test", phone: "09123456789",
    dataPrivacyConsent: true, dataPrivacySignature: "Public Request", tenantId: tenants[1 - index].id,
  })));

  await t.test("reads, updates, aggregates and credentials remain clinic-specific", async () => {
    await assert.rejects(prisma.patient.findMany(), /outside a request scope/);
    for (let index = 0; index < 2; index++) await run(index, async () => {
      assert.equal(await prisma.patient.count(), 1);
      assert.equal(await prisma.patient.findUnique({ where: { id: fixtures[1 - index].patient.id } }), null);
      assert.equal((await patientDetail(request({}), { params: Promise.resolve({ id: fixtures[1 - index].patient.id }) })).status, 404);
      assert.equal((await updatePatient(request({ notes: "Cannot change foreign data" }), { params: Promise.resolve({ id: fixtures[1 - index].patient.id }) })).status, 404);
      assert.equal((await deleteService(request({}), { params: Promise.resolve({ id: fixtures[1 - index].service.id }) })).status, 404);
      assert.deepEqual(await getUsersByRole("ADMIN"), [fixtures[index].user.id]);
      assert.equal((await (await clinicInfo()).json()).data.name, tenants[index].name);
      await assert.rejects(prisma.user.create({ data: { name: "Duplicate", email: " OWNER@example.test ", passwordHash: "not-a-login" } }));
      await assert.rejects(createUser({ name: "Linked", email: "linked@example.test", role: "DENTIST", password: "test-only-password", dentistId: fixtures[1 - index].dentist.id }, fixtures[index].user.id));
    });
  });
  await t.test("forged ownership and cross-clinic booking relations are rejected before delivery", async () => {
    assert.equal((await booking(0, true)).status, 400);
    assert.equal(sent, 0);
    await run(0, async () => {
      await assert.rejects(prisma.patient.create({ data: { tenantId: tenants[1].id, firstName: "Foreign", lastName: "Patient", phone: "test" } }));
      await assert.rejects(prisma.$queryRaw`SELECT 1`, /Unscoped database access/);
      await assert.rejects(prisma.dentist.update({ where: { id: fixtures[0].dentist.id }, data: { availability: { deleteMany: {} } } }), /Nested writes/);
      await assert.rejects(prisma.appointment.create({ data: { referenceNumber: randomUUID(), appointmentDate: new Date("2099-01-05"), startTime: "09:00", endTime: "09:30", dentistId: fixtures[0].dentist.id, serviceId: fixtures[1].service.id, patientId: fixtures[0].patient.id } }));
    });
  });
  await t.test("booking transactions retain isolation, concurrency protection and notification boundaries", async () => {
    const sameClinic = await Promise.all([booking(0), booking(0)]);
    assert.deepEqual(sameClinic.map(response => response.status).sort(), [201, 409]);
    assert.equal((await booking(1)).status, 201);
    for (let index = 0; index < 2; index++) await run(index, async () => {
      assert.equal(await prisma.appointment.count(), 1);
      assert.equal((await prisma.notification.findMany()).every(notice => notice.userId === fixtures[index].user.id), true);
      assert.equal((await prisma.activity.findMany()).every(row => row.tenantId === tenants[index].id), true);
      const list = await (await appointments(new Request("http://clinic.localhost/api/appointments"))).json();
      assert.equal(JSON.stringify(list).includes(fixtures[1 - index].dentist.id), false);
    });
    const foreign = await run(1, () => prisma.appointment.findFirstOrThrow());
    const sentBefore = sent;
    assert.equal((await run(0, () => confirm(request({}), { params: Promise.resolve({ id: foreign.id }) }))).status, 404);
    assert.equal(sent, sentBefore, "No email may be sent before tenant ownership is established");
    assert.equal(await run(0, () => prisma.confirmationEmail.count()), 0);
  });
  await t.test("clinic closures do not affect another clinic and the same closure date is allowed", async () => {
    const date = new Date("2099-01-06");
    await run(0, () => createClinicClosure({ date: "2099-01-06" }, fixtures[0].user.id));
    assert.equal(await run(0, () => isSlotAvailable(fixtures[0].dentist.id, "09:00", "09:30", date)), false);
    assert.equal(await run(1, () => isSlotAvailable(fixtures[1].dentist.id, "09:00", "09:30", date)), true);
    await run(1, () => createClinicClosure({ date: "2099-01-06" }, fixtures[1].user.id));
    await assert.rejects(run(0, () => createClinicClosure({ date: "2099-01-06" }, fixtures[0].user.id)));
  });
  await t.test("background reminders and delivery history remain inside the captured clinic", async () => {
    const tomorrow = dateKeyToUtc(addDaysToKey(clinicDateKey(), 1));
    for (let index = 0; index < 2; index++) await run(index, async () => {
      await prisma.appointment.create({ data: { referenceNumber: randomUUID(), appointmentDate: tomorrow, startTime: "09:00", endTime: "09:30", patientId: fixtures[index].patient.id, dentistId: fixtures[index].dentist.id, serviceId: fixtures[index].service.id } });
      await prisma.emailLog.create({ data: { to: "synthetic@example.test", subject: tenants[index].name, template: "test", status: "SKIPPED" } });
    });
    await run(0, () => processUpcomingAppointmentReminders());
    assert.equal(await run(0, () => prisma.notification.count({ where: { type: "APPOINTMENT_REMINDER" } })), 1);
    assert.equal(await run(1, () => prisma.notification.count({ where: { type: "APPOINTMENT_REMINDER" } })), 0);
    assert.equal(await run(0, () => getUnreadCount(fixtures[1].user.id)), 0);
    for (let index = 0; index < 2; index++) {
      const history = await run(index, () => prisma.emailLog.findMany());
      assert.deepEqual(history.map(row => row.subject), [tenants[index].name]);
    }
  });
});
