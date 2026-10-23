import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../../src/lib/db";
import { mockPrismaMethod } from "../helpers/mock-prisma";

test("public clinic reads select only public details and handle missing configuration", async (t) => {
  const publicFields = ["name", "address", "phone", "email", "openingTime", "closingTime", "lunchBreakStart", "lunchBreakEnd"];
  const clinic = Object.fromEntries(publicFields.map(field => [field, null]));
  const read = mockPrismaMethod(t, prisma.clinicSetting, "findUnique", async () => clinic);
  const { GET } = await import("../../src/app/api/clinic/route");
  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, clinic);
  const query = read.mock.calls[0].arguments[0] as unknown as { select: Record<string, boolean> };
  assert.deepEqual(Object.keys(query.select).sort(), publicFields.sort());
  assert(Object.values(query.select).every(Boolean));

  read.mock.mockImplementation(async () => null);
  assert.equal((await GET()).status, 404);
  read.mock.mockImplementation(async () => { throw new Error("unavailable"); });
  t.mock.method(console, "error", () => undefined);
  assert.equal((await GET()).status, 500);
});
