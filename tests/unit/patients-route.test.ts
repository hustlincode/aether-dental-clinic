import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../../src/lib/db";
import { mockModuleExports } from "../helpers/mock-module";
import { mockPrismaMethod } from "../helpers/mock-prisma";

test("patient API bounds legacy all requests and applies filters/sort before pagination", async (t) => {
  mockModuleExports(t, require.resolve("../../src/lib/api"), { requireAuth: async () => ({ user: { id: "staff", role: "ADMIN" }, error: null }) });
  const { GET } = await import("../../src/app/api/patients/route");
  const query = mockPrismaMethod(t, prisma.patient, "findMany", async () => []);
  mockPrismaMethod(t, prisma.patient, "count", async () => 123);
  const response = await GET(new Request("http://localhost/api/patients?all=true&page=2&pageSize=999&search=Ada&status=ACTIVE&hasAppointments=1&sort=appointments&order=desc"));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.data.pagination, { page: 2, pageSize: 50, total: 123, totalPages: 3 });
  const args = query.mock.calls[0].arguments[0] as unknown as { take: number; skip: number; where: { OR: unknown[]; status: string; appointments: unknown }; orderBy: unknown };
  assert.equal(args.take, 50);
  assert.equal(args.skip, 50);
  assert.equal(args.where.status, "ACTIVE");
  assert.deepEqual(args.where.appointments, { some: {} });
  assert.equal(args.where.OR.length, 4);
  assert.deepEqual(args.orderBy, [{ appointments: { _count: "desc" } }, { id: "asc" }]);
  for (const params of ["status=UNKNOWN", "sort=email", "order=evil", "hasAppointments=maybe"]) {
    assert.equal((await GET(new Request(`http://localhost/api/patients?${params}`))).status, 400);
  }
  assert.equal(query.mock.callCount(), 1, "invalid filters must not reach the database");
});
