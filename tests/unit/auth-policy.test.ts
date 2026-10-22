import assert from "node:assert/strict";
import test from "node:test";
import { isDemoEnabled, refreshAuthToken } from "../../src/lib/auth-policy";
import { prisma } from "../../src/lib/db";
import { mockPrismaMethod } from "../helpers/mock-prisma";

test("production forbids passwordless demo even when explicitly enabled", () => {
  assert.equal(isDemoEnabled({ NODE_ENV: "production", DEMO_MODE: "true" }), false);
  assert.equal(isDemoEnabled({ NODE_ENV: "development" }), false);
  assert.equal(isDemoEnabled({ NODE_ENV: "development", DEMO_MODE: "true" }), true);
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
