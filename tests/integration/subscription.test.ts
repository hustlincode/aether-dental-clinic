import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { rawPrisma } from "../../src/lib/raw-db";
import { prisma } from "../../src/lib/db";
import { withTenantContext } from "../../src/lib/tenant";
import { SubscriptionReadOnlyError } from "../../src/lib/subscription";
import { mockModuleExports } from "../helpers/mock-module";

test("trial expiry preserves records, denies writes and operator renewal restores access", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async t => {
  assert.equal(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL);
  const url = new URL(process.env.TEST_DATABASE_URL!);
  assert(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_test"));
  let tenant = await rawPrisma.tenant.create({ data: { slug: `subscription-${randomUUID()}`, name: "Subscription test" } });
  const run = <T>(work: () => Promise<T>) => withTenantContext(tenant, work);
  t.after(async () => {
    await rawPrisma.activity.deleteMany({ where: { tenantId: tenant.id } });
    await rawPrisma.patient.deleteMany({ where: { tenantId: tenant.id } });
    await rawPrisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await rawPrisma.tenant.delete({ where: { id: tenant.id } });
    await rawPrisma.$disconnect();
  });
  const patient = await run(() => prisma.patient.create({ data: { firstName: "Preserved", lastName: "Patient", phone: "test-only" } }));
  assert.equal(tenant.subscriptionMode, "TRIAL");
  assert(tenant.subscriptionEndsAt && tenant.subscriptionEndsAt.getTime() > Date.now() + 29 * 86400000);
  tenant = await rawPrisma.tenant.update({ where: { id: tenant.id }, data: { subscriptionEndsAt: new Date(0) } });
  assert.equal(await run(() => prisma.patient.count()), 1);
  assert.equal((await run(() => prisma.patient.findUniqueOrThrow({ where: { id: patient.id } }))).firstName, "Preserved");
  for (const work of [
    () => prisma.patient.update({ where: { id: patient.id }, data: { firstName: "Changed" } }),
    () => prisma.patient.deleteMany(),
    () => prisma.patient.createMany({ data: [{ firstName: "New", lastName: "Patient", phone: "test" }] }),
    () => prisma.$transaction(tx => tx.patient.update({ where: { id: patient.id }, data: { notes: "Changed" } })),
  ]) await assert.rejects(run<unknown>(work), SubscriptionReadOnlyError);
  mockModuleExports(t, require.resolve("../../src/auth"), { auth: async () => null });
  const { POST } = await import("../../src/app/api/appointments/route");
  const response = await run(() => POST(new Request("http://clinic.localhost/api/appointments", { method: "POST", body: "{}" })));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "SUBSCRIPTION_READ_ONLY");
  assert.equal(await run(() => prisma.patient.count()), 1);
  const { manageSubscription } = await import("../../scripts/manage-subscription");
  await manageSubscription(rawPrisma, { action: "renew", slug: tenant.slug, months: 1 });
  tenant = await rawPrisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(tenant.subscriptionMode, "PAID");
  await run(() => prisma.patient.update({ where: { id: patient.id }, data: { notes: "Access restored" } }));
  assert.equal(await run(() => prisma.patient.count()), 1);
});
