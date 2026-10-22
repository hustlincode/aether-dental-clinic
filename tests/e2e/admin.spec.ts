import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

test.describe("authenticated staff regressions", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires an isolated PostgreSQL TEST_DATABASE_URL.");
  let prisma: PrismaClient;
  let staffId: string;
  test.beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    expect(url.pathname.endsWith("_test")).toBe(true);
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    const marker = randomUUID();
    const user = await prisma.user.create({ data: { name: "Browser Test", email: `${marker}@example.test`, passwordHash: "not-a-login", role: "ADMIN" } });
    staffId = user.id;
  });
  test.afterAll(async () => {
    if (!prisma) return;
    if (staffId) await prisma.user.delete({ where: { id: staffId } });
    await prisma.$disconnect();
  });
  test.beforeEach(async ({ context, page }) => {
    const name = "authjs.session-token";
    const value = await encode({ token: { id: staffId, role: "ADMIN" }, secret: process.env.NEXTAUTH_SECRET || "isolated-browser-regression-secret", salt: name });
    await context.addCookies([{ name, value, url: "http://127.0.0.1:3100", httpOnly: true, sameSite: "Lax" }]);
    await page.route("**/api/notifications**", route => route.fulfill({ json: { success: true, data: { items: [], unreadCount: 0, count: 0 } } }));
  });

  test("current-page click and reverted search keep the appointments list usable", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/appointments?**", route => {
      calls++;
      return route.fulfill({ json: { success: true, data: { items: [{ id: "a", referenceNumber: "APT-test", appointmentDate: "2027-01-05T00:00:00Z", startTime: "09:00", endTime: "09:30", status: "PENDING", dentistId: "d", serviceId: "s", patient: { firstName: "Test", lastName: "Patient", email: "test@example.test", phone: "09123456789" }, dentist: { id: "d", name: "Dr Test" }, service: { id: "s", name: "Cleaning" } }], pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } } } });
    });
    await page.goto("/admin/appointments");
    await expect(page.getByText("APT-test", { exact: true })).toBeVisible();
    await page.locator('button[aria-current="page"]:visible').click();
    await expect(page.getByText("APT-test", { exact: true })).toBeVisible();
    await expect(page.locator("[aria-busy]")).toHaveAttribute("aria-busy", "false");
    await page.getByRole("searchbox", { name: "Search appointments" }).fill("quickly reverted");
    await page.getByRole("searchbox", { name: "Search appointments" }).fill("");
    await page.waitForTimeout(450);
    await expect(page.getByText("APT-test", { exact: true })).toBeVisible();
    await expect(page.locator("[aria-busy]")).toHaveAttribute("aria-busy", "false");
    expect(calls).toBe(1);
  });

  test("patient pagination and search request bounded server pages", async ({ page }) => {
    const requested: URL[] = [];
    await page.route("**/api/patients?**", route => {
      const url = new URL(route.request().url());
      requested.push(url);
      return route.fulfill({ json: { success: true, data: { patients: [{ id: "p", firstName: "Test", lastName: "Patient", phone: "09123456789", email: null, status: "ACTIVE", createdAt: "2027-01-01T00:00:00Z", updatedAt: "2027-01-01T00:00:00Z", _count: { appointments: 0 }, appointments: [] }], pagination: { page: Number(url.searchParams.get("page")), pageSize: 20, total: 21, totalPages: 2 } } } });
    });
    await page.goto("/admin/patients");
    await expect(page.getByText("Test Patient", { exact: true })).toBeVisible();
    expect(requested[0].searchParams.get("all")).toBeNull();
    expect(requested[0].searchParams.get("pageSize")).toBe("20");
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect.poll(() => requested.at(-1)?.searchParams.get("page")).toBe("2");
    await page.getByPlaceholder("Search patients...").fill("Ada");
    await expect.poll(() => requested.at(-1)?.searchParams.get("search")).toBe("Ada");
    expect(requested.at(-1)?.searchParams.get("page")).toBe("1");
  });

  test("mobile navigation traps focus, closes on Escape and returns focus to its trigger", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/appointments?**", route => route.fulfill({ json: { success: true, data: { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } } }));
    await page.goto("/admin/appointments");
    const trigger = page.getByRole("button", { name: "Toggle navigation menu" });
    await expect(page.getByRole("dialog", { name: "Clinic navigation" })).toHaveCount(0);
    await trigger.click();
    const navigation = page.getByRole("dialog", { name: "Clinic navigation" });
    await expect(navigation).toBeVisible();
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      expect(await navigation.evaluate(node => node.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(navigation).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("a previously issued staff session immediately loses demoted and deactivated privileges", async ({ context, page }) => {
    try {
      expect((await context.request.post("/api/services", { data: {} })).status()).toBe(422);
      await prisma.user.update({ where: { id: staffId }, data: { role: "RECEPTIONIST" } });
      expect((await context.request.post("/api/services", { data: {} })).status()).toBe(403);
      await prisma.user.update({ where: { id: staffId }, data: { active: false } });
      expect((await context.request.get("/api/patients")).status()).toBe(401);
      await page.goto("/admin/appointments");
      await expect(page).toHaveURL(/\/login$/);
    } finally {
      await prisma.user.update({ where: { id: staffId }, data: { role: "ADMIN", active: true } });
    }
  });
});
