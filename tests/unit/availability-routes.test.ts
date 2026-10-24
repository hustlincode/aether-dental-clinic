import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/db";
import { mockModuleExports } from "../helpers/mock-module";
import { mockPrismaMethod } from "../helpers/mock-prisma";

test("availability routes preserve validation, active-service errors and empty availability", async (t) => {
  let service: { id: string; status: string; durationMin: number } | null = { id: "service", status: "ACTIVE", durationMin: 30 };
  const queries: Prisma.ServiceFindUniqueArgs[] = [];
  mockPrismaMethod(t, prisma.service, "findUnique", async (query: Prisma.ServiceFindUniqueArgs) => { queries.push(query); return service; });
  let slots: { start: string; end: string }[] | null = [{ start: "09:00", end: "09:30" }];
  let dateReads = 0;
  let slotReads = 0;
  mockModuleExports(t, require.resolve("../../src/lib/scheduling"), {
    getAvailableDates: async () => { dateReads++; return ["2099-01-05"]; },
    getAvailableSlots: async () => { slotReads++; return slots; },
  });
  const dates = await import("../../src/app/api/availability/dates/route");
  const daySlots = await import("../../src/app/api/availability/slots/route");
  const getDates = (query: string) => dates.GET(new Request(`http://localhost/api/availability/dates?${query}`));
  const getSlots = (query: string) => daySlots.GET(new Request(`http://localhost/api/availability/slots?${query}`));

  for (const query of ["", "dentistId=dentist", "dentistId=dentist&serviceId=service&daysAhead=61", "dentistId=dentist&serviceId=service&daysAhead=1.5"]) {
    assert.equal((await getDates(query)).status, 400);
  }
  for (const query of ["", "dentistId=dentist&serviceId=service", "dentistId=dentist&serviceId=service&date=2099-02-30"]) {
    assert.equal((await getSlots(query)).status, 400);
  }
  assert.equal(queries.length, 0);

  assert.deepEqual(await (await getDates("dentistId=dentist&serviceId=service&daysAhead=45")).json(), { success: true, data: ["2099-01-05"] });
  const slotQuery = "dentistId=dentist&serviceId=service&date=2099-01-05";
  assert.deepEqual(await (await getSlots(slotQuery)).json(), { success: true, data: slots, available: true });
  assert.deepEqual(queries[0].select, { id: true, status: true, durationMin: true });
  assert.deepEqual(queries[1].select, { id: true, status: true, durationMin: true });
  slots = null;
  assert.deepEqual(await (await getSlots(slotQuery)).json(), { success: true, data: [], available: false });
  service.status = "INACTIVE";
  assert.equal((await getDates("dentistId=dentist&serviceId=service")).status, 404);
  assert.equal((await getSlots(slotQuery)).status, 404);
  service = null;
  assert.equal((await getSlots(slotQuery)).status, 404);
  assert.equal(dateReads, 1);
  assert.equal(slotReads, 2);
});
