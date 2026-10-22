import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../../src/lib/db";
import { mockPrismaMethod } from "../helpers/mock-prisma";
import { mockModuleExports } from "../helpers/mock-module";

test("public booking creates an isolated patient and never returns a matching existing contact", async (t) => {
  mockModuleExports(t, require.resolve("../../src/lib/api"), { getSessionUser: async () => null });
  mockModuleExports(t, require.resolve("../../src/lib/email"), { sendAppointmentEmail: async () => ({ ok: false, status: "FAILED" }) });
  mockModuleExports(t, require.resolve("../../src/lib/notifications"), { notifyAppointmentCreated: async () => undefined });
  mockModuleExports(t, require.resolve("../../src/lib/home-cache"), { revalidateHomepage: () => undefined });
  const { POST } = await import("../../src/app/api/appointments/route");
  const patient = { id: "new-patient", firstName: "New", lastName: "Person", email: "new@example.test", phone: "09123456789" };
  const service = { id: "service", status: "ACTIVE", name: "Cleaning", durationMin: 30, price: 500 };
  const dentist = { id: "dentist", status: "ACTIVE", name: "Dr Test", availability: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].map(dayOfWeek => ({ dayOfWeek, startTime: "09:00", endTime: "17:00", breakStart: null, breakEnd: null, isWorking: true })) };
  const existingLookup = mockPrismaMethod(t, prisma.patient, "findFirst", async () => ({ id: "victim", email: "private@example.test" }));
  const createPatient = mockPrismaMethod(t, prisma.patient, "create", async () => patient);
  mockPrismaMethod(t, prisma.service, "findUnique", async () => service);
  mockPrismaMethod(t, prisma.dentist, "findUnique", async () => dentist);
  mockPrismaMethod(t, prisma.clinicSetting, "findUnique", async () => ({ openingTime: "09:00", closingTime: "17:00", lunchBreakStart: null, lunchBreakEnd: null }));
  mockPrismaMethod(t, prisma.blockedDate, "findFirst", async () => null);
  mockPrismaMethod(t, prisma.appointment, "findMany", async () => []);
  mockPrismaMethod(t, prisma.appointment, "create", async (...args: never[]) => {
    const query = args[0] as { data: { patientId: string } };
    assert.equal(query.data.patientId, "new-patient");
    return { ...query.data, id: "appointment", patient, dentist, service };
  });
  mockPrismaMethod(t, prisma.activity, "create", async () => ({}));
  mockPrismaMethod(t, prisma.user, "findMany", async () => []);
  mockPrismaMethod(t, prisma.emailLog, "create", async () => ({}));
  mockPrismaMethod(t, prisma, "$transaction", async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma));
  const response = await POST(new Request("http://localhost/api/appointments", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...patient, serviceId: "service", dentistId: "dentist", date: "2099-01-05", startTime: "09:00", dataPrivacyConsent: true, dataPrivacySignature: "New Person" }),
  }));
  const result = await response.json();
  assert.equal(response.status, 201, JSON.stringify(result));
  assert.equal(existingLookup.mock.callCount(), 0);
  assert.equal(createPatient.mock.callCount(), 1);
  assert.equal(result.data.subject.patientEmail, "new@example.test");
  assert.equal(JSON.stringify(result).includes("private@example.test"), false);
  assert.equal(result.data.subject.status, "PENDING");
  assert.equal(result.data.email.ok, false);
  for (const invalid of [{ startTime: "99:99" }, { date: "2099-02-30" }, { dataPrivacyConsent: false }]) {
    const rejected = await POST(new Request("http://localhost/api/appointments", {
      method: "POST", body: JSON.stringify({ ...patient, serviceId: "service", dentistId: "dentist", date: "2099-01-05", startTime: "09:00", dataPrivacyConsent: true, dataPrivacySignature: "New Person", ...invalid }),
    }));
    assert([400, 422].includes(rejected.status));
  }
  assert.equal(createPatient.mock.callCount(), 1, "invalid bookings must never create patients");
});
