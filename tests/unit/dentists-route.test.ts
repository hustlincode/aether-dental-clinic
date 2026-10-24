import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/db";
import { mockModuleExports } from "../helpers/mock-module";
import { mockPrismaMethod } from "../helpers/mock-prisma";

test("booking dentist projection stays public and active while staff lists retain their contract", async (t) => {
  let role: string | null = null;
  let authCalls = 0;
  mockModuleExports(t, require.resolve("../../src/lib/api"), { getSessionUser: async () => {
    authCalls++; return role ? { id: "staff", role } : null;
  } });
  const queries: Prisma.DentistFindManyArgs[] = [];
  const dentist = { id: "dentist", name: "Dr Test", specialization: "General", profileImage: null, status: "ACTIVE" };
  mockPrismaMethod(t, prisma.dentist, "findMany", async (query: Prisma.DentistFindManyArgs) => {
    queries.push(query); return query.select ? [dentist] : [{ ...dentist, availability: [], _count: { appointments: 12 } }];
  });
  const { GET } = await import("../../src/app/api/dentists/route");
  const get = (query = "") => GET(new Request(`http://localhost/api/dentists${query}`));

  const booking = await (await get("?view=booking&all=true")).json();
  assert.deepEqual(booking, { success: true, data: [dentist] });
  assert.equal(authCalls, 0);
  assert.deepEqual(queries.at(-1)?.where, { status: "ACTIVE" });
  assert.deepEqual(queries.at(-1)?.select, { id: true, name: true, specialization: true, profileImage: true, status: true });
  assert.equal(queries.at(-1)?.include, undefined);

  const publicList = await (await get()).json();
  assert.equal(authCalls, 0);
  assert.deepEqual(publicList.data[0]._count, { appointments: 12 });
  assert.deepEqual(queries.at(-1)?.include, { availability: { orderBy: { dayOfWeek: "asc" } }, _count: { select: { appointments: true } } });
  await get("?all=true");
  assert.equal(authCalls, 1);
  assert.deepEqual(queries.at(-1)?.where, { status: "ACTIVE" });
  role = "ADMIN";
  await get("?all=true");
  assert.equal(authCalls, 2);
  assert.equal(queries.at(-1)?.where, undefined);
  role = "UNKNOWN";
  await get("?all=true");
  assert.deepEqual(queries.at(-1)?.where, { status: "ACTIVE" });
});
