import assert from "node:assert/strict";
import test from "node:test";
import { tenantProvisionSchema, provisionTenant } from "../../scripts/provision-tenant";
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const input = { slug: "second-clinic", name: " Second Clinic ", email: " Owner@Example.Test ", adminName: " Clinic Owner ", password: "long-enough-password" };

test("tenant provisioning validates subdomains and bcrypt byte limits", () => {
  assert.equal(tenantProvisionSchema.parse(input).email, "owner@example.test");
  for (const slug of ["www", "api", "-clinic", "clinic-", "a.b", "Clinic", "x".repeat(64)]) {
    assert.equal(tenantProvisionSchema.safeParse({ ...input, slug }).success, false);
  }
  assert.equal(tenantProvisionSchema.safeParse({ ...input, password: "é".repeat(37) }).success, false);
  assert.equal(tenantProvisionSchema.safeParse({ ...input, password: "short" }).success, false);
});

test("provisioning uses one transaction with explicit ownership and a hashed password", async () => {
  const calls: Array<{ model: string; data: Record<string, unknown> }> = [];
  let transactions = 0;
  const tx = Object.fromEntries(["tenant", "clinicSetting", "user"].map(model => [model, {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      calls.push({ model, data });
      return { ...data, id: "tenant-second" };
    },
  }]));
  const client = { $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
    transactions++;
    return work(tx);
  } } as unknown as Pick<PrismaClient, "$transaction">;
  const now = new Date("2026-01-01T12:34:56.000Z");
  assert.deepEqual(await provisionTenant(client, input, now), { id: "tenant-second", slug: input.slug });
  assert.equal(transactions, 1);
  assert.deepEqual(calls.map(call => call.model), ["tenant", "clinicSetting", "user"]);
  assert.equal(calls[0].data.subscriptionMode, "TRIAL");
  assert.deepEqual(calls[0].data.subscriptionEndsAt, new Date("2026-01-31T12:34:56.000Z"));
  assert.equal(calls[1].data.tenantId, "tenant-second");
  assert.equal(calls[2].data.tenantId, "tenant-second");
  assert.equal(calls[2].data.role, "ADMIN");
  assert.equal(calls[2].data.email, "owner@example.test");
  assert(await bcrypt.compare(input.password, calls[2].data.passwordHash as string));
  assert(!JSON.stringify(calls).includes(input.password));
});
