import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type PrismaClient } from "@prisma/client";
import { manageSubscription, parseSubscriptionArgs } from "../../scripts/manage-subscription";

const now = new Date("2026-01-31T12:34:56.789Z");

function fixture(mode = "TRIAL", end: Date | null = new Date("2026-02-28T12:34:56.789Z")) {
  const tenant = { id: "tenant-a", slug: "clinic-a", active: true, subscriptionMode: mode, subscriptionEndsAt: end };
  const writes: Array<{ model: string; data: Record<string, unknown> }> = [];
  const tx = {
    tenant: {
      findUnique: async () => ({ ...tenant }),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        assert.deepEqual(where, { id: tenant.id });
        writes.push({ model: "tenant", data });
        return { ...tenant, ...data };
      },
    },
    activity: { create: async ({ data }: { data: Record<string, unknown> }) => { writes.push({ model: "activity", data }); } },
  };
  const client = { $transaction: async (work: (value: unknown) => Promise<unknown>, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: "Serializable" });
    return work(tx);
  } } as unknown as Pick<PrismaClient, "$transaction">;
  return { tenant, tx, client, writes };
}

test("subscription CLI accepts only bounded explicit operator commands", () => {
  assert.deepEqual(parseSubscriptionArgs(["renew", "clinic-a", "12"]), { action: "renew", slug: "clinic-a", months: 12 });
  assert.deepEqual(parseSubscriptionArgs(["status", "clinic-a"]), { action: "status", slug: "clinic-a" });
  for (const args of [["renew", "clinic-a", "0"], ["renew", "clinic-a", "13"], ["renew", "clinic-a", "1.5"], ["renew", "clinic-a"], ["renew", "clinic-a", "NaN"], ["status", "clinic-a", "1"], ["expire", "clinic-a", "extra"], ["renew", "clinic-a", "1", "extra"], ["status", "Clinic-A"], ["delete", "clinic-a"]]) {
    assert.throws(() => parseSubscriptionArgs(args));
  }
});

test("subscription status is read-only and internal clinics reject operator changes", async () => {
  const { client, tenant, writes } = fixture("INTERNAL", null);
  assert.deepEqual(await manageSubscription(client, { action: "status", slug: tenant.slug }, now), tenant);
  for (const action of ["renew", "expire"]) {
    await assert.rejects(manageSubscription(client, { action, slug: tenant.slug, ...(action === "renew" ? { months: 1 } : {}) }, now), /Internal clinic/);
  }
  assert.equal(writes.length, 0);
});

test("renewal extends an unexpired term and writes a tenant-owned audit in the same transaction", async () => {
  const { client, writes } = fixture();
  const result = await manageSubscription(client, { action: "renew", slug: "clinic-a", months: 2 }, now);
  assert.equal(result.subscriptionMode, "PAID");
  assert.deepEqual(result.subscriptionEndsAt, new Date("2026-04-28T12:34:56.789Z"));
  assert.deepEqual(writes.map(row => row.model), ["tenant", "activity"]);
  assert.equal(writes[1].data.tenantId, "tenant-a");
  assert.equal(writes[1].data.entity, "Tenant");
  assert.deepEqual(JSON.parse(writes[1].data.description as string), {
    before: { mode: "TRIAL", endsAt: "2026-02-28T12:34:56.789Z" },
    after: { mode: "PAID", endsAt: "2026-04-28T12:34:56.789Z" },
  });
});

test("renewal starts expired or missing terms now and clamps UTC month ends including leap years", async () => {
  for (const previous of [null, new Date("2025-12-01T00:00:00Z")]) {
    const { client } = fixture("TRIAL", previous);
    assert.deepEqual((await manageSubscription(client, { action: "renew", slug: "clinic-a", months: 1 }, now)).subscriptionEndsAt, new Date("2026-02-28T12:34:56.789Z"));
  }
  const { client } = fixture("PAID", new Date("2028-01-31T12:34:56.789Z"));
  assert.deepEqual((await manageSubscription(client, { action: "renew", slug: "clinic-a", months: 1 }, now)).subscriptionEndsAt, new Date("2028-02-29T12:34:56.789Z"));
});

test("expiry preserves the subscription mode and ends access at the supplied instant", async () => {
  const { client, writes } = fixture("PAID");
  const result = await manageSubscription(client, { action: "expire", slug: "clinic-a" }, now);
  assert.equal(result.subscriptionMode, "PAID");
  assert.equal(result.subscriptionEndsAt, now);
  assert.equal(writes[1].data.action, "Subscription expired");
});

test("subscription changes propagate audit failures and retry only serialization conflicts", async () => {
  const { client, tx, writes } = fixture();
  tx.activity.create = async () => { throw new Error("audit failed"); };
  await assert.rejects(manageSubscription(client, { action: "expire", slug: "clinic-a" }, now), /audit failed/);
  assert.equal(writes.length, 1);
  let attempts = 0;
  const retryClient = { $transaction: async () => {
    attempts++;
    throw new Prisma.PrismaClientKnownRequestError("Concurrent subscription change", { code: "P2034", clientVersion: "test" });
  } } as unknown as Pick<PrismaClient, "$transaction">;
  await assert.rejects(manageSubscription(retryClient, { action: "renew", slug: "clinic-a", months: 1 }, now));
  assert.equal(attempts, 4);
});
