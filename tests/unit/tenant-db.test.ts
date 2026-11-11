import assert from "node:assert/strict";
import test from "node:test";
import { scopeTenantQuery } from "../../src/lib/tenant-db";

test("tenant queries scope every read, mutation and aggregate", () => {
  for (const operation of ["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy", "delete", "deleteMany"]) {
    assert.deepEqual(scopeTenantQuery("Patient", operation, { where: { id: "foreign", OR: [{ tenantId: "other" }] } }, "clinic-a").where,
      { id: "foreign", OR: [{ tenantId: "other" }], tenantId: "clinic-a" });
  }
  for (const operation of ["update", "updateMany", "updateManyAndReturn"]) {
    const result = scopeTenantQuery("Patient", operation, { where: { id: "foreign" }, data: { notes: "changed" } }, "clinic-a");
    assert.deepEqual(result.where, { id: "foreign", tenantId: "clinic-a" });
    assert.deepEqual(result.data, { notes: "changed" });
  }
});

test("tenant creates and upserts attach trusted ownership without mutating caller data", () => {
  const input = { data: [{ firstName: "One" }, { firstName: "Two" }] };
  const result = scopeTenantQuery("Patient", "createMany", input, "clinic-a");
  assert.deepEqual(result.data, [{ firstName: "One", tenantId: "clinic-a" }, { firstName: "Two", tenantId: "clinic-a" }]);
  assert.equal("tenantId" in input.data[0], false);
  const upsert = scopeTenantQuery("Availability", "upsert", { where: { id: "slot" }, create: { dentistId: "dentist" }, update: { startTime: "09:00" } }, "clinic-a");
  assert.deepEqual(upsert.create, { dentistId: "dentist", tenantId: "clinic-a" });
  assert.deepEqual(upsert.where, { id: "slot", tenantId: "clinic-a" });
});

test("missing context, raw SQL, tenant administration, ownership changes and nested writes fail closed", () => {
  assert.throws(() => scopeTenantQuery("Patient", "findMany", {}, ""));
  assert.throws(() => scopeTenantQuery(undefined, "$queryRaw", [], "clinic-a"));
  assert.throws(() => scopeTenantQuery("Tenant", "findMany", {}, "clinic-a"));
  assert.throws(() => scopeTenantQuery("Patient", "create", { data: { tenantId: "clinic-b" } }, "clinic-a"));
  assert.throws(() => scopeTenantQuery("Patient", "updateMany", { data: { tenantId: { set: "clinic-b" } } }, "clinic-a"));
  assert.throws(() => scopeTenantQuery("Dentist", "create", { data: { availability: { create: [] } } }, "clinic-a"));
  assert.throws(() => scopeTenantQuery("Patient", "update", { data: { appointments: { updateMany: {} } } }, "clinic-a"));
  assert.throws(() => scopeTenantQuery("Patient", "futureOperation", {}, "clinic-a"));
});
