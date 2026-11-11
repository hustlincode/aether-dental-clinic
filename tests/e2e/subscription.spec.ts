import { randomUUID } from "node:crypto";
import { test, expect, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

test.describe("clinic subscription access", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires an isolated migrated PostgreSQL TEST_DATABASE_URL.");
  const marker = randomUUID();
  let prisma: PrismaClient;
  const fixtures: Array<{ id: string; slug: string; userId: string }> = [];
  const base = (index: number) => `http://${fixtures[index].slug}.localhost:3100`;

  async function authenticate(context: BrowserContext, index: number) {
    const name = "authjs.session-token";
    const value = await encode({ token: { id: fixtures[index].userId, tenantId: fixtures[index].id, sessionVersion: 0 }, secret: process.env.NEXTAUTH_SECRET || "isolated-browser-regression-secret", salt: name });
    await context.addCookies([{ name, value, url: base(index), httpOnly: true, sameSite: "Lax" }]);
    return { Host: `${fixtures[index].slug}.localhost:3100`, Cookie: `${name}=${value}` };
  }

  test.beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    expect(["127.0.0.1", "localhost", "[::1]"]).toContain(url.hostname);
    expect(url.pathname.endsWith("_test")).toBe(true);
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    for (const [index, state] of ["trial", "expired"].entries()) {
      const tenant = await prisma.tenant.create({ data: {
        slug: `subscription-${state}-${marker}`, name: `Subscription ${state}`,
        subscriptionMode: "TRIAL", subscriptionEndsAt: new Date(Date.now() + (index === 0 ? 30 : -1) * 24 * 60 * 60 * 1000),
      } });
      const user = await prisma.user.create({ data: { tenantId: tenant.id, name: "Owner", email: "owner@example.test", passwordHash: "not-a-login", role: "ADMIN" } });
      fixtures.push({ id: tenant.id, slug: tenant.slug, userId: user.id });
      await prisma.clinicSetting.create({ data: { tenantId: tenant.id, name: tenant.name, openingTime: "09:00", closingTime: "17:00" } });
      await prisma.patient.create({ data: { tenantId: tenant.id, firstName: "Retained", lastName: "Patient", phone: "09123456789" } });
    }
  });
  test.afterAll(async () => {
    if (!prisma) return;
    for (const fixture of fixtures) {
      await prisma.activity.deleteMany({ where: { tenantId: fixture.id } });
      await prisma.notification.deleteMany({ where: { tenantId: fixture.id } });
      await prisma.patient.deleteMany({ where: { tenantId: fixture.id } });
      await prisma.user.deleteMany({ where: { tenantId: fixture.id } });
      await prisma.clinicSetting.deleteMany({ where: { tenantId: fixture.id } });
      await prisma.tenant.delete({ where: { id: fixture.id } });
    }
    await prisma.$disconnect();
  });

  test("trial administrator sees subscription details and can add records", async ({ page, context }) => {
    const headers = await authenticate(context, 0);
    await page.goto(`${base(0)}/admin/subscription`);
    await expect(page.getByRole("heading", { name: "Subscription", exact: true })).toBeVisible();
    await expect(page.getByText("Trial active", { exact: true })).toBeVisible();
    await expect(page.getByText("30 days", { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "30-day trial" })).toBeVisible();
    const created = await context.request.post("http://127.0.0.1:3100/api/patients", { headers, data: { firstName: "Trial", lastName: "Patient", phone: "09123456789" } });
    expect(created.status()).toBe(201);
  });

  test("expired clinic remains readable and retains records while writes are denied", async ({ page, context }) => {
    const headers = await authenticate(context, 1);
    await page.goto(`${base(1)}/admin/subscription`);
    await expect(page.getByText("Expired", { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Subscription expired" })).toBeVisible();
    await expect(page.getByText("Your clinic is read-only", { exact: true })).toBeVisible();
    const retained = await context.request.get("http://127.0.0.1:3100/api/patients", { headers });
    expect(retained.status()).toBe(200);
    expect((await retained.json()).data.patients).toEqual(expect.arrayContaining([expect.objectContaining({ firstName: "Retained" })]));
    const blocked = await context.request.post("http://127.0.0.1:3100/api/patients", { headers, data: { firstName: "Blocked", lastName: "Patient", phone: "09123456789" } });
    expect(blocked.status()).toBe(403);
    expect(await prisma.patient.count({ where: { tenantId: fixtures[1].id } })).toBe(1);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.goto(`${base(1)}/book`);
    await expect(page.getByRole("heading", { name: "Online booking is currently unavailable" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm booking", exact: false })).toHaveCount(0);
  });
});
