import assert from "node:assert/strict";
import test from "node:test";
import { mockModuleExports } from "../helpers/mock-module";
import { mockPrismaMethod } from "../helpers/mock-prisma";

test("real API and server-session guards reject another clinic's session", async (t) => {
  const tenant = { id: "clinic-a", slug: "clinic-a", name: "Clinic A", active: true,
    subscriptionMode: "INTERNAL" as "INTERNAL" | "TRIAL" | "PAID", subscriptionEndsAt: null as Date | null };
  let session: { user: { id: string; tenantId: string; role: string } } | null = null;
  mockModuleExports(t, require.resolve("../../src/lib/tenant"), { getRequestTenant: async () => tenant });
  mockModuleExports(t, require.resolve("../../src/auth"), { auth: async () => session });
  const api = await import("../../src/lib/api");
  const server = await import("../../src/lib/server-session");
  assert.equal(await api.getSessionUser(), null);
  assert.equal(await server.getServerSession(), null);
  session = { user: { id: "staff", tenantId: "clinic-b", role: "ADMIN" } };
  assert.equal(await api.getSessionUser(), null);
  assert.equal((await api.requireAuth()).error?.status, 401);
  assert.equal(await server.getServerSession(), null);
  session.user.tenantId = tenant.id;
  assert.equal((await api.getSessionUser())?.id, "staff");
  assert.equal((await api.requireAuth()).error, null);
  assert.equal((await server.getServerSession())?.user.id, "staff");
  tenant.subscriptionMode = "TRIAL";
  tenant.subscriptionEndsAt = new Date(0);
  assert.equal((await api.requireAuth()).error, null, "Expiry must preserve authenticated reads");
  assert.equal((await server.getServerSession())?.user.id, "staff");
  for (const result of [await api.requireWriteAuth(), await api.requireWriteRole("ADMIN")]) {
    assert.equal(result.error?.status, 403);
    assert.equal((await result.error!.json()).code, "SUBSCRIPTION_READ_ONLY");
  }
});

test("tenant resolver rejects missing and suspended clinics and accepts an active clinic", async (t) => {
  const previousDomain = process.env.TENANT_BASE_DOMAIN;
  t.after(() => {
    if (previousDomain === undefined) delete process.env.TENANT_BASE_DOMAIN;
    else process.env.TENANT_BASE_DOMAIN = previousDomain;
  });
  process.env.TENANT_BASE_DOMAIN = "clinics.example.test";
  mockModuleExports(t, require.resolve("next/headers"), {
    headers: async () => new Headers({ host: "north.clinics.example.test" }),
  });
  const { rawPrisma } = await import("../../src/lib/raw-db");
  let clinic: { id: string; slug: string; name: string; active: boolean; subscriptionMode: "INTERNAL" | "TRIAL" | "PAID"; subscriptionEndsAt: Date | null } | null = null;
  const lookup = mockPrismaMethod(t, rawPrisma.tenant, "findUnique", async () => clinic);
  // Reload after the header mock: the request API must come from this test's context.
  const modulePath = require.resolve("../../src/lib/tenant");
  const originalModule = require.cache[modulePath];
  delete require.cache[modulePath];
  t.after(() => { if (originalModule) require.cache[modulePath] = originalModule; });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getRequestTenant } = require(modulePath) as typeof import("../../src/lib/tenant");
  await assert.rejects(getRequestTenant(), /NEXT_HTTP_ERROR_FALLBACK;404/);
  clinic = { id: "clinic-a", slug: "north", name: "North", active: false, subscriptionMode: "INTERNAL", subscriptionEndsAt: null };
  await assert.rejects(getRequestTenant(), /NEXT_HTTP_ERROR_FALLBACK;404/);
  clinic.active = true;
  assert.deepEqual(await getRequestTenant(), clinic);
  clinic.subscriptionMode = "TRIAL";
  clinic.subscriptionEndsAt = new Date(0);
  assert.deepEqual(await getRequestTenant(), clinic, "Expired clinics still resolve for authenticated reads");
  assert.deepEqual(lookup.mock.calls[0].arguments[0], {
    where: { slug: "north" }, select: { id: true, slug: true, name: true, active: true, subscriptionMode: true, subscriptionEndsAt: true },
  });
});
