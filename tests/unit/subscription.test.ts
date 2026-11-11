import assert from "node:assert/strict";
import test from "node:test";
import { assertSubscriptionWrite, subscriptionAccess, SubscriptionReadOnlyError } from "../../src/lib/subscription";

const now = new Date("2026-11-08T00:00:00Z");
const future = new Date("2026-12-08T00:00:00Z");

test("internal owner access, trials and paid periods have explicit entitlements", () => {
  assert.equal(subscriptionAccess({ subscriptionMode: "INTERNAL", subscriptionEndsAt: null }, now).status, "INTERNAL");
  for (const [subscriptionMode, status] of [["TRIAL", "TRIAL"], ["PAID", "ACTIVE"]]) {
    assert.deepEqual(subscriptionAccess({ subscriptionMode, subscriptionEndsAt: future }, now), { status, canWrite: true, endsAt: future });
    assert.doesNotThrow(() => assertSubscriptionWrite({ subscriptionMode, subscriptionEndsAt: future }, now));
  }
});

test("expiry is exclusive and missing or invalid subscription metadata denies writes", () => {
  for (const tenant of [
    {}, { subscriptionMode: "UNKNOWN", subscriptionEndsAt: future },
    { subscriptionMode: "TRIAL", subscriptionEndsAt: null },
    { subscriptionMode: "PAID", subscriptionEndsAt: new Date("invalid") },
    { subscriptionMode: "PAID", subscriptionEndsAt: now },
    { subscriptionMode: "TRIAL", subscriptionEndsAt: new Date(now.getTime() - 1) },
  ]) {
    assert.equal(subscriptionAccess(tenant, now).status, "EXPIRED");
    assert.throws(() => assertSubscriptionWrite(tenant, now), SubscriptionReadOnlyError);
  }
  assert.equal(subscriptionAccess({ subscriptionMode: "TRIAL", subscriptionEndsAt: new Date(now.getTime() + 1) }, now).canWrite, true);
});
