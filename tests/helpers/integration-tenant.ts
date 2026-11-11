import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { rawPrisma } from "../../src/lib/raw-db";

export async function integrationTenant(t: TestContext, slug: string) {
  const target = new URL(process.env.TEST_DATABASE_URL!);
  assert.equal(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL);
  assert(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) && target.pathname.endsWith("_test"));
  const tenant = await rawPrisma.tenant.create({ data: { slug: `${slug}-${randomUUID()}`, name: "Isolated regression clinic" } });
  t.diagnostic(`Using isolated tenant ${slug}.`);
  return tenant;
}
