import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { manageSubscription } from "../../scripts/manage-subscription";

test("managed subscription migration preserves clinics and operator updates are atomic", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async t => {
  const target = process.env.TEST_DATABASE_URL;
  assert(target && target === process.env.DATABASE_URL);
  const url = new URL(target);
  assert(["postgres:", "postgresql:"].includes(url.protocol));
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_test"));
  const baseClient = new PrismaClient({ datasourceUrl: target });
  const schema = `subscription_migration_${randomUUID().replaceAll("-", "")}`;
  assert(/^subscription_migration_[a-f0-9]{32}$/.test(schema));
  await baseClient.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const scopedUrl = new URL(target);
  scopedUrl.searchParams.set("schema", schema);
  const client = new PrismaClient({ datasourceUrl: scopedUrl.toString() });
  t.after(async () => {
    await client.$disconnect();
    try { await baseClient.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); }
    finally { await baseClient.$disconnect(); }
  });
  async function execute(sql: string) {
    const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "execute", "--stdin", "--url", target!], {
      input: `SET search_path TO "${schema}";\n${sql}`, encoding: "utf8", timeout: 60_000,
      env: { ...process.env, DATABASE_URL: target, DIRECT_URL: target },
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  }
  for (const migration of ["202610220000_existing_schema", "202610220001_patient_contact_is_not_identity", "202610230000_clinic_closure_uniqueness", "202610270000_user_management", "202611080000_multitenancy"]) {
    await execute(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"));
  }
  await execute(`
    INSERT INTO tenants (id,slug,name,active,updated_at) VALUES ('pilot','pilot','Existing pilot',false,'2020-01-01');
    INSERT INTO patients (id,tenant_id,first_name,last_name,phone,notes,updated_at) VALUES ('patient','pilot','Preserved','Patient','test-only','Preserved notes','2020-01-01');
  `);
  const before = await client.$queryRawUnsafe<Array<Record<string, unknown>>>("SELECT * FROM tenants ORDER BY id");
  const patientsBefore = await client.$queryRawUnsafe("SELECT * FROM patients ORDER BY id");
  const startedAt = new Date();
  await execute(await readFile("prisma/migrations/202611080001_managed_subscriptions/migration.sql", "utf8"));
  const completedAt = new Date();
  const after = await client.$queryRawUnsafe<Array<Record<string, unknown>>>("SELECT * FROM tenants ORDER BY id /* subscription columns added */");
  for (const row of after) {
    const { subscription_mode: mode, subscription_ends_at: end, ...original } = row;
    assert.deepEqual(original, before.find(previous => previous.id === row.id));
    if (row.slug === "aether") {
      assert.equal(mode, "INTERNAL");
      assert.equal(end, null);
    } else {
      assert.equal(mode, "TRIAL");
      assert(end instanceof Date);
      assert(end.getTime() >= startedAt.getTime() + 30 * 86400_000 - 1000);
      assert(end.getTime() <= completedAt.getTime() + 30 * 86400_000 + 1000);
    }
  }
  assert.deepEqual(await client.$queryRawUnsafe("SELECT * FROM patients ORDER BY id"), patientsBefore);

  const created = await client.tenant.create({ data: { slug: "new-clinic", name: "New clinic" } });
  assert.equal(created.subscriptionMode, "TRIAL");
  assert(created.subscriptionEndsAt && created.subscriptionEndsAt > new Date());
  const now = new Date("2028-01-01T12:34:56.789Z");
  await client.tenant.update({ where: { slug: "pilot" }, data: { subscriptionEndsAt: new Date("2028-01-31T12:34:56.789Z") } });
  await Promise.all([1, 1].map(months => manageSubscription(client, { action: "renew", slug: "pilot", months }, now)));
  const renewed = await client.tenant.findUniqueOrThrow({ where: { slug: "pilot" } });
  assert.equal(renewed.active, false, "Renewal must not reactivate a suspended clinic.");
  assert.equal(renewed.subscriptionMode, "PAID");
  assert.deepEqual(renewed.subscriptionEndsAt, new Date("2028-03-29T12:34:56.789Z"));
  assert.equal(await client.activity.count({ where: { tenantId: "pilot", action: "Subscription renewed" } }), 2);

  await client.$executeRawUnsafe("ALTER TABLE activities ADD CONSTRAINT reject_expiry_audit CHECK (action <> 'Subscription expired')");
  await assert.rejects(manageSubscription(client, { action: "expire", slug: "pilot" }, now));
  assert.deepEqual(await client.tenant.findUniqueOrThrow({ where: { slug: "pilot" } }), renewed, "Failed audit must roll back the subscription update.");
  await client.$executeRawUnsafe("ALTER TABLE activities DROP CONSTRAINT reject_expiry_audit");
  const expired = await manageSubscription(client, { action: "expire", slug: "pilot" }, now);
  assert.deepEqual(expired.subscriptionEndsAt, now);
  assert.equal(expired.subscriptionMode, "PAID");
  assert.equal(await client.activity.count({ where: { tenantId: "pilot", action: "Subscription expired" } }), 1);
  assert.deepEqual(await manageSubscription(client, { action: "status", slug: "pilot" }, now), expired);
  await assert.rejects(manageSubscription(client, { action: "renew", slug: "aether", months: 1 }, now), /Internal clinic/);
  await assert.rejects(manageSubscription(client, { action: "expire", slug: "aether" }, now), /Internal clinic/);
  assert.deepEqual(await client.$queryRawUnsafe("SELECT * FROM patients ORDER BY id"), patientsBefore);
});
