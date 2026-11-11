import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import bcrypt from "bcryptjs";

test.describe("clinic subdomain isolation", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires an isolated migrated PostgreSQL TEST_DATABASE_URL.");
  const marker = randomUUID();
  const tenants: { id: string; slug: string; name: string }[] = [];
  const users: { id: string }[] = [];
  let prisma: PrismaClient;
  test.beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    expect(["127.0.0.1", "localhost", "[::1]"]).toContain(url.hostname);
    expect(url.pathname.endsWith("_test")).toBe(true);
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    for (const suffix of ["a", "b"]) {
      const tenant = await prisma.tenant.create({ data: { slug: `browser-${suffix}-${marker}`, name: `Browser Clinic ${suffix}` } });
      tenants.push(tenant);
      await prisma.clinicSetting.create({ data: { tenantId: tenant.id, name: tenant.name, openingTime: "09:00", closingTime: "17:00" } });
      users.push(await prisma.user.create({ data: { tenantId: tenant.id, name: "Owner", email: "same-owner@example.test", passwordHash: await bcrypt.hash(`test-${suffix}-${marker}`, 10), role: "ADMIN" } }));
    }
  });
  test.afterAll(async () => {
    if (!prisma) return;
    for (const tenant of tenants) {
      await prisma.activity.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.clinicSetting.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.tenant.delete({ where: { id: tenant.id } });
    }
    await prisma.$disconnect();
  });

  test("alternating clinic hosts never share rendered clinic content", async ({ request }) => {
    for (const index of [0, 1, 0, 1]) {
      const host = `${tenants[index].slug}.localhost:3100`;
      const response = await request.get("http://127.0.0.1:3100/api/clinic", { headers: { Host: host } });
      expect(response.status()).toBe(200);
      expect((await response.json()).data.name).toBe(tenants[index].name);
      expect(response.headers()["cache-control"]).toContain("no-store");
      const page = await request.get("http://127.0.0.1:3100/login", { headers: { Host: host } });
      expect(page.status()).toBe(200);
      const html = await page.text();
      expect(html).toContain(tenants[index].name);
      expect(html).not.toContain(tenants[1 - index].name);
    }
  });

  test("a clinic session cannot authorize another host, and auth cookies are host-only", async ({ request }) => {
    const name = "authjs.session-token";
    const value = await encode({ token: { id: users[0].id, tenantId: tenants[0].id, sessionVersion: 0 }, secret: process.env.NEXTAUTH_SECRET || "isolated-browser-regression-secret", salt: name });
    const own = await request.get("http://127.0.0.1:3100/api/admin/users", { headers: { Host: `${tenants[0].slug}.localhost:3100`, Cookie: `${name}=${value}` } });
    expect(own.status()).toBe(200);
    const foreign = await request.get("http://127.0.0.1:3100/api/admin/users", { headers: { Host: `${tenants[1].slug}.localhost:3100`, Cookie: `${name}=${value}` } });
    expect(foreign.status()).toBe(401);
    const csrf = await request.get("http://127.0.0.1:3100/api/auth/csrf", { headers: { Host: `${tenants[0].slug}.localhost:3100` } });
    for (const header of csrf.headersArray().filter(header => header.name.toLowerCase() === "set-cookie")) {
      expect(header.value).not.toMatch(/;\s*domain=/i);
    }
  });

  test("unknown hosts, spoofed forwarding and suspended clinics fail closed", async ({ request }) => {
    expect((await request.get("http://127.0.0.1:3100/api/clinic", { headers: { Host: "unknown-clinic.localhost:3100" } })).status()).toBe(404);
    expect((await request.get("http://127.0.0.1:3100/api/clinic", { headers: { Host: "attacker.test", "x-forwarded-host": `${tenants[0].slug}.localhost:3100` } })).status()).toBe(404);
    await prisma.tenant.update({ where: { id: tenants[1].id }, data: { active: false } });
    expect((await request.get("http://127.0.0.1:3100/api/clinic", { headers: { Host: `${tenants[1].slug}.localhost:3100` } })).status()).toBe(404);
    await prisma.tenant.update({ where: { id: tenants[1].id }, data: { active: true } });
  });
});
