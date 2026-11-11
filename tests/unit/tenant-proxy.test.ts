import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../../src/proxy";
import { rawPrisma } from "../../src/lib/raw-db";
import { mockPrismaMethod } from "../helpers/mock-prisma";

test("clinic ingress rejects unknown, suspended and malformed hosts without shared caching", async t => {
  const previous = { base: process.env.TENANT_BASE_DOMAIN, trust: process.env.TRUST_PROXY_HOST };
  process.env.TENANT_BASE_DOMAIN = "example.test";
  process.env.TRUST_PROXY_HOST = "false";
  t.after(() => {
    if (previous.base === undefined) delete process.env.TENANT_BASE_DOMAIN; else process.env.TENANT_BASE_DOMAIN = previous.base;
    if (previous.trust === undefined) delete process.env.TRUST_PROXY_HOST; else process.env.TRUST_PROXY_HOST = previous.trust;
  });
  let tenant: { active: boolean; subscriptionMode?: "INTERNAL" | "TRIAL" | "PAID"; subscriptionEndsAt?: Date | null } | null = { active: true, subscriptionMode: "INTERNAL", subscriptionEndsAt: null };
  const lookup = mockPrismaMethod(t, rawPrisma.tenant, "findUnique", async () => tenant);
  const request = (host: string, path = "/", method = "GET") => new NextRequest(`http://127.0.0.1${path}`, { method, headers: { host, "x-forwarded-host": "evil.example.test" } });
  let response = await proxy(request("clinic.example.test"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-middleware-request-x-forwarded-host"), "clinic.example.test");
  assert.equal(response.headers.get("x-middleware-request-x-forwarded-proto"), "http");
  assert.deepEqual(lookup.mock.calls[0].arguments[0], { where: { slug: "clinic" }, select: { active: true, subscriptionMode: true, subscriptionEndsAt: true } });
  tenant = { active: true, subscriptionMode: "TRIAL", subscriptionEndsAt: new Date(0) };
  assert.equal((await proxy(request("clinic.example.test", "/api/patients"))).status, 200);
  assert.equal((await proxy(request("clinic.example.test", "/admin"))).status, 200);
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
    const denied = await proxy(request("clinic.example.test", "/api/appointments", method));
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).code, "SUBSCRIPTION_READ_ONLY");
    assert.equal(denied.headers.get("cache-control"), "private, no-store");
  }
  assert.equal((await proxy(request("clinic.example.test", "/api/auth/callback/credentials", "POST"))).status, 200);
  assert.equal((await proxy(request("clinic.example.test", "/api/auth/signout", "POST"))).status, 200);
  assert.equal((await proxy(request("clinic.example.test", "/api/authentic", "POST"))).status, 403);
  tenant = { active: true };
  assert.equal((await proxy(request("clinic.example.test", "/api/appointments", "POST"))).status, 403, "Missing subscription data must deny writes");
  tenant = { active: true, subscriptionMode: "PAID", subscriptionEndsAt: new Date("2099-01-01") };
  assert.equal((await proxy(request("clinic.example.test", "/api/appointments", "POST"))).status, 200);
  const calls = lookup.mock.callCount();
  assert.equal((await proxy(request("clinic.example.test.attacker.test"))).status, 404);
  assert.equal(lookup.mock.callCount(), calls);
  tenant = null;
  response = await proxy(request("missing.example.test"));
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "no-store");
  tenant = { active: false, subscriptionMode: "INTERNAL", subscriptionEndsAt: null };
  assert.equal((await proxy(request("suspended.example.test"))).status, 404);
  lookup.mock.mockImplementation(async () => { throw new Error("offline"); });
  assert.equal((await proxy(request("clinic.example.test"))).status, 503);
});
