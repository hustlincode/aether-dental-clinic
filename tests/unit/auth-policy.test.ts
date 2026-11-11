import assert from "node:assert/strict";
import test from "node:test";
import { isDemoEmail, isDemoEnabled, refreshAuthToken } from "../../src/lib/auth-policy";
import { prisma } from "../../src/lib/db";
import { mockPrismaMethod } from "../helpers/mock-prisma";

const tenant = { id: "clinic-a", slug: "clinic-a", name: "Clinic A", active: true, subscriptionMode: "INTERNAL" as const, subscriptionEndsAt: null };

test("demo access requires explicit mode and an isolated clinic in every environment", () => {
  assert.equal(isDemoEnabled({ NODE_ENV: "production", DEMO_MODE: "true", DEMO_TENANT_SLUG: "showcase" }), true);
  assert.equal(isDemoEnabled({ NODE_ENV: "production", DEMO_MODE: "true" }), false);
  assert.equal(isDemoEnabled({ NODE_ENV: "production" }), false);
  assert.equal(isDemoEnabled({ NODE_ENV: "production", DEMO_MODE: "false", DEMO_TENANT_SLUG: "showcase" }), false);
  assert.equal(isDemoEnabled({ NODE_ENV: "development" }), false);
});

test("demo sessions remain read-only and cannot move outside the configured showcase clinic", async (t) => {
  const previousMode = process.env.DEMO_MODE;
  const previousClinic = process.env.DEMO_TENANT_SLUG;
  t.after(() => {
    if (previousMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousMode;
    if (previousClinic === undefined) delete process.env.DEMO_TENANT_SLUG;
    else process.env.DEMO_TENANT_SLUG = previousClinic;
  });
  process.env.DEMO_MODE = "true";
  process.env.DEMO_TENANT_SLUG = tenant.slug;
  mockPrismaMethod(t, prisma.user, "findUnique", async () => ({ id: "demo", tenantId: tenant.id, name: "Demo", email: "demo@example.test", active: true, role: "ADMIN" }));
  const token = { id: "demo", tenantId: tenant.id, isDemo: true };
  assert.equal((await refreshAuthToken(token, tenant))?.isDemo, true);
  process.env.DEMO_TENANT_SLUG = "another-clinic";
  assert.equal(await refreshAuthToken(token, tenant), null);
  process.env.DEMO_MODE = "false";
  assert.equal(await refreshAuthToken(token, tenant), null);
});

test("an existing token immediately loses deleted, inactive or demoted privileges", async (t) => {
  const query = mockPrismaMethod(t, prisma.user, "findUnique", async () => ({ id: "staff", tenantId: tenant.id, name: "Staff", email: "staff@example.test", active: true, role: "RECEPTIONIST" }));
  const token = { id: "staff", tenantId: tenant.id, role: "ADMIN", name: "Old Name", email: "old@example.test" };
  const refreshed = await refreshAuthToken(token, tenant);
  assert.equal(refreshed?.role, "RECEPTIONIST");
  assert.equal(refreshed?.name, "Staff");
  assert.equal(refreshed?.email, "staff@example.test");
  assert.equal(refreshed?.tenantId, tenant.id);
  assert.deepEqual(query.mock.calls[0].arguments[0], {
    where: { id: "staff", tenantId: tenant.id },
    select: { id: true, name: true, email: true, role: true, active: true, sessionVersion: true, tenantId: true },
  });
  query.mock.mockImplementation(async () => ({ id: "staff", tenantId: tenant.id, active: false }) as never);
  assert.equal(await refreshAuthToken(token, tenant), null);
  query.mock.mockImplementation(async () => null as never);
  assert.equal(await refreshAuthToken(token, tenant), null);
  assert.equal(await refreshAuthToken({}, tenant), null);
});

test("legacy, cross-clinic, suspended-clinic and mismatched account tokens fail closed", async (t) => {
  const query = mockPrismaMethod(t, prisma.user, "findUnique", async () => ({ id: "staff", tenantId: "clinic-b", active: true, sessionVersion: 0 }));
  assert.equal(await refreshAuthToken({ id: "staff" }, tenant), null);
  assert.equal(await refreshAuthToken({ id: "staff", tenantId: "clinic-b" }, tenant), null);
  assert.equal(await refreshAuthToken({ id: "staff", tenantId: tenant.id }, { ...tenant, active: false }), null);
  assert.equal(query.mock.callCount(), 0, "Rejected context never reads an account");
  assert.equal(await refreshAuthToken({ id: "staff", tenantId: tenant.id }, tenant), null);
});

test("reset versions revoke old tokens without reviving them on reactivation", async (t) => {
  const account = { id: "staff", tenantId: tenant.id, name: "Staff", email: "staff@example.test", role: "ASSISTANT", active: true, sessionVersion: 0 };
  mockPrismaMethod(t, prisma.user, "findUnique", async () => account);
  const current = { id: "staff", tenantId: tenant.id, sessionVersion: 0 };
  assert.equal((await refreshAuthToken(current, tenant))?.role, "ASSISTANT");
  account.sessionVersion++;
  assert.equal(await refreshAuthToken(current, tenant), null, "An old authorization snapshot cannot adopt a reset version");
  account.active = false;
  assert.equal(await refreshAuthToken({ ...current, sessionVersion: 1 }, tenant), null);
  account.active = true;
  assert.equal(await refreshAuthToken(current, tenant), null);
  assert.equal((await refreshAuthToken({ ...current, sessionVersion: 1 }, tenant))?.role, "ASSISTANT");
});

test("both configured and fallback demo identities remain reserved", (t) => {
  const previous = process.env.DEMO_EMAIL;
  t.after(() => {
    if (previous === undefined) delete process.env.DEMO_EMAIL;
    else process.env.DEMO_EMAIL = previous;
  });
  process.env.DEMO_EMAIL = "custom-demo@example.test";
  assert.equal(isDemoEmail("CUSTOM-DEMO@example.test"), true);
  assert.equal(isDemoEmail("demo@aetherdental.ph"), true);
  assert.equal(isDemoEmail("staff@example.test"), false);
});
