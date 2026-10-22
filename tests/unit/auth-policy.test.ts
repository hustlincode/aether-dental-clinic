import assert from "node:assert/strict";
import test from "node:test";
import { isDemoEnabled, refreshAuthToken } from "../../src/lib/auth-policy";
import { prisma } from "../../src/lib/db";
import { mockPrismaMethod } from "../helpers/mock-prisma";

test("demo access requires explicit opt-in in every environment, including production", () => {
  assert.equal(isDemoEnabled({ NODE_ENV: "production", DEMO_MODE: "true" }), true);
  assert.equal(isDemoEnabled({ NODE_ENV: "production" }), false);
  assert.equal(isDemoEnabled({ NODE_ENV: "production", DEMO_MODE: "false" }), false);
  assert.equal(isDemoEnabled({ NODE_ENV: "development" }), false);
  assert.equal(isDemoEnabled({ NODE_ENV: "development", DEMO_MODE: "true" }), true);
});

test("production demo sessions stay flagged read-only and are rejected when demo mode is disabled", async (t) => {
  const env: Record<string, string | undefined> = process.env;
  const previousMode = process.env.DEMO_MODE;
  const previousEnv = process.env.NODE_ENV;
  t.after(() => {
    if (previousMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousMode;
    if (previousEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousEnv;
  });
  env.NODE_ENV = "production";
  process.env.DEMO_MODE = "true";
  mockPrismaMethod(t, prisma.user, "findUnique", async () => ({ id: "demo", name: "Demo", email: "demo@example.test", active: true, role: "ADMIN" }));
  const token = { id: "demo", isDemo: true };
  assert.equal((await refreshAuthToken(token))?.isDemo, true);
  process.env.DEMO_MODE = "false";
  assert.equal(await refreshAuthToken(token), null);
});

test("an existing token immediately loses deleted, inactive or demoted privileges", async (t) => {
  const query = mockPrismaMethod(t, prisma.user, "findUnique", async () => ({ id: "staff", name: "Staff", email: "staff@example.test", active: true, role: "RECEPTIONIST" }));
  const token = { id: "staff", role: "ADMIN", name: "Old Name", email: "old@example.test" };
  const refreshed = await refreshAuthToken(token);
  assert.equal(refreshed?.role, "RECEPTIONIST");
  assert.equal(refreshed?.name, "Staff");
  assert.equal(refreshed?.email, "staff@example.test");
  query.mock.mockImplementation(async () => ({ id: "staff", active: false }) as never);
  assert.equal(await refreshAuthToken(token), null);
  query.mock.mockImplementation(async () => null as never);
  assert.equal(await refreshAuthToken(token), null);
  assert.equal(await refreshAuthToken({}), null);
});
