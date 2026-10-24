import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/db";
import { mockModuleExports } from "../helpers/mock-module";
import { mockPrismaMethod } from "../helpers/mock-prisma";

test("calendar appointment view bounds reads, preserves role scoping and paginates dense months", async (t) => {
  let user: { id: string; role: string; email: string } | null = { id: "staff", role: "ADMIN", email: "staff@example.test" };
  let assigned: { id: string } | null = { id: "assigned-dentist" };
  mockModuleExports(t, require.resolve("../../src/lib/api"), { requireAuth: async () => user
    ? { user, error: null }
    : { user: null, error: new Response(JSON.stringify({ success: false }), { status: 401 }) } });
  const rows = Array.from({ length: 601 }, (_, index) => ({
    id: `a-${String(index).padStart(3, "0")}`, referenceNumber: `APT-${index}`, appointmentDate: "2099-01-05T00:00:00.000Z",
    startTime: "09:00", endTime: "09:30", status: "PENDING", notes: null,
    patient: { firstName: "Test", lastName: "Patient", phone: "09123456789" }, dentist: { name: "Dr Test" }, service: { name: "Cleaning" },
  }));
  const reads: Prisma.AppointmentFindManyArgs[] = [];
  const counts: Prisma.AppointmentCountArgs[] = [];
  mockPrismaMethod(t, prisma.appointment, "findMany", async (query: Prisma.AppointmentFindManyArgs) => {
    reads.push(query); return rows.slice(query.skip ?? 0, (query.skip ?? 0) + (query.take ?? 20));
  });
  mockPrismaMethod(t, prisma.appointment, "count", async (query: Prisma.AppointmentCountArgs) => { counts.push(query); return rows.length; });
  mockPrismaMethod(t, prisma.dentist, "findFirst", async () => assigned);
  const { GET } = await import("../../src/app/api/appointments/route");
  const get = (query: string) => GET(new Request(`http://localhost/api/appointments?${query}`));
  const calendar = "view=calendar&from=2099-01-01&to=2099-01-31";

  await t.test("invalid or unbounded ranges never reach appointment queries", async () => {
    for (const query of ["view=calendar", "view=calendar&from=2099-01-01", "view=calendar&to=2099-01-31",
      "view=calendar&from=2099-02-30&to=2099-03-01", "view=calendar&from=2099-01-02&to=2099-01-01",
      "view=calendar&from=2099-01-01&to=2099-02-01"]) {
      assert.equal((await get(query)).status, 400, query);
    }
    assert.equal(reads.length, 0);
    assert.equal(counts.length, 0);
  });

  await t.test("all 601 records are reachable through bounded stable pages", async () => {
    const ids: string[] = [];
    for (let page = 1; page <= 4; page++) {
      const response = await get(`${calendar}&page=${page}&pageSize=500`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.data.pagination, { page, pageSize: 200, total: 601, totalPages: 4 });
      ids.push(...body.data.items.map((item: { id: string }) => item.id));
    }
    assert.equal(new Set(ids).size, 601);
    assert.equal(ids.length, 601);
    assert.deepEqual(reads.map(read => read.skip), [0, 200, 400, 600]);
    assert.deepEqual(reads[0].orderBy, [{ appointmentDate: "asc" }, { startTime: "asc" }, { id: "asc" }]);
    assert.deepEqual(reads[0].select, {
      id: true, referenceNumber: true, appointmentDate: true, startTime: true, endTime: true, status: true, notes: true,
      patient: { select: { firstName: true, lastName: true, phone: true } }, dentist: { select: { name: true } }, service: { select: { name: true } },
    });
    assert.equal(reads[0].include, undefined);
    assert.deepEqual(reads[0].where, counts[0].where);
    await get(`${calendar}&sort=date:desc&pageSize=2`);
    assert.deepEqual(reads.at(-1)?.orderBy, [{ appointmentDate: "desc" }, { startTime: "desc" }, { id: "asc" }]);
    const defaults = await (await get(calendar)).json();
    assert.equal(defaults.data.pagination.pageSize, 200);
  });

  await t.test("dentists cannot override their assignment through calendar filters", async () => {
    user = { id: "dentist-user", role: "DENTIST", email: "dentist@example.test" };
    await get(`${calendar}&dentistId=someone-else&status=PENDING`);
    assert.equal(reads.at(-1)?.where?.dentistId, "assigned-dentist");
    assert.equal(counts.at(-1)?.where?.dentistId, "assigned-dentist");
    assert.equal(reads.at(-1)?.where?.status, "PENDING");
    assigned = null;
    const before = reads.length;
    const empty = await (await get(`${calendar}&page=2`)).json();
    assert.deepEqual(empty.data, { items: [], pagination: { page: 2, pageSize: 200, total: 0, totalPages: 0 } });
    assert.equal(reads.length, before);
    user = null;
    assert.equal((await get(calendar)).status, 401);
    assert.equal(reads.length, before);
  });

  await t.test("existing list and legacy range contracts remain unchanged", async () => {
    user = { id: "staff", role: "ADMIN", email: "staff@example.test" };
    const list = await (await get("page=2&pageSize=20&date=2099-01-05")).json();
    assert.deepEqual(list.data.pagination, { page: 2, pageSize: 20, total: 601, totalPages: 31 });
    assert.equal(reads.at(-1)?.skip, 20);
    assert.equal(reads.at(-1)?.select, undefined);
    assert.deepEqual(reads.at(-1)?.include, { patient: true, dentist: true, service: true });
    const range = await (await get("from=2099-01-01&to=2099-01-31&page=3")).json();
    assert.deepEqual(range.data.pagination, { page: 1, pageSize: 500, total: 601, totalPages: 2 });
    assert.equal(reads.at(-1)?.skip, undefined);
    assert.equal(reads.at(-1)?.select, undefined);
  });
});
