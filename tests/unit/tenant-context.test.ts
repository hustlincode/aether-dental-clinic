import assert from "node:assert/strict";
import test from "node:test";
import { getRequestTenant, withTenantContext } from "../../src/lib/tenant";

test("captured clinic context stays isolated across concurrent background tasks", async () => {
  const clinics = ["a", "b"].map(id => ({ id, slug: id, name: id, active: true, subscriptionMode: "INTERNAL" as const, subscriptionEndsAt: null }));
  const results = await Promise.all(clinics.map(clinic => withTenantContext(clinic, async () => {
    await Promise.resolve();
    return (await getRequestTenant()).id;
  })));
  assert.deepEqual(results, ["a", "b"]);
  assert.throws(() => withTenantContext({ ...clinics[0], active: false }, async () => undefined), /active clinic/);
  await assert.rejects(getRequestTenant(), /outside a request scope/);
});
