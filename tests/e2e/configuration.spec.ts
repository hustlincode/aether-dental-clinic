import { randomUUID } from "node:crypto";
import { test, expect, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

test.describe("clinic configuration", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires an isolated PostgreSQL TEST_DATABASE_URL.");
  let prisma: PrismaClient;
  let staffId: string;
  const marker = randomUUID();
  async function authenticate(context: BrowserContext) {
    const name = "authjs.session-token";
    const value = await encode({ token: { id: staffId, role: "ADMIN" }, secret: process.env.NEXTAUTH_SECRET || "isolated-browser-regression-secret", salt: name });
    await context.addCookies([{ name, value, url: "http://127.0.0.1:3100", httpOnly: true, sameSite: "Lax" }]);
  }
  test.beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    expect(url.pathname.endsWith("_test")).toBe(true);
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    expect(await prisma.clinicSetting.count(), "Use an empty disposable database; never replace existing settings.").toBe(0);
    staffId = (await prisma.user.create({ data: { name: "Configuration browser test", email: `${marker}@example.test`, passwordHash: "not-a-login", role: "ADMIN" } })).id;
    await prisma.clinicSetting.create({ data: { id: "singleton", name: "Aether Dental", address: "Original address", openingTime: "09:00", closingTime: "17:00" } });
  });
  test.afterAll(async () => {
    if (!prisma) return;
    if (staffId) {
      await prisma.activity.deleteMany({ where: { userId: staffId } });
      await prisma.blockedDate.deleteMany({ where: { reason: marker } });
      await prisma.clinicSetting.delete({ where: { id: "singleton" } });
      await prisma.user.delete({ where: { id: staffId } });
    }
    await prisma.$disconnect();
  });
  test.beforeEach(async ({ context, page }) => {
    await authenticate(context);
    await page.route("**/api/notifications**", route => route.fulfill({ json: { success: true, data: { items: [], unreadCount: 0, count: 0 } } }));
  });

  test("admin saves contacts and hours, manages closures, and refreshes public content", async ({ page }) => {
    await page.goto("/admin/configuration");
    await page.getByLabel("Address", { exact: true }).fill("Browser test clinic address");
    await page.getByLabel("Public phone", { exact: true }).fill("09123456789");
    await page.getByLabel("Public email", { exact: true }).fill("browser-clinic@example.test");
    await page.getByLabel("Opening time", { exact: true }).fill("08:00");
    let saved = page.waitForResponse(response => response.url().endsWith("/api/admin/configuration") && response.request().method() === "PATCH");
    await page.getByRole("button", { name: "Save contact details", exact: true }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByLabel("Opening time", { exact: true })).toHaveValue("08:00");
    expect((await prisma.clinicSetting.findUniqueOrThrow({ where: { id: "singleton" } })).openingTime).toBe("09:00");
    saved = page.waitForResponse(response => response.url().endsWith("/api/admin/configuration") && response.request().method() === "PATCH");
    await page.getByRole("button", { name: "Save operating hours", exact: true }).click();
    expect((await saved).status()).toBe(200);
    expect((await prisma.clinicSetting.findUniqueOrThrow({ where: { id: "singleton" } })).openingTime).toBe("08:00");
    await page.getByLabel("Closure date (Manila)", { exact: true }).fill("2099-04-05");
    await page.getByLabel("Internal reason (optional)", { exact: true }).fill(marker);
    await page.getByRole("button", { name: "Add clinic closure", exact: true }).click();
    await expect(page.getByRole("button", { name: "Remove closure for 2099-04-05", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Remove closure for 2099-04-05", exact: true }).click();
    const removed = page.waitForResponse(response => response.url().includes("/api/admin/clinic-closures/") && response.request().method() === "DELETE");
    await page.getByRole("button", { name: "Remove closure", exact: true }).click();
    expect((await removed).status()).toBe(200);
    await expect(page.getByRole("button", { name: "Remove closure for 2099-04-05", exact: true })).toHaveCount(0);
    expect(await prisma.blockedDate.count({ where: { reason: marker } })).toBe(0);

    await page.goto("/");
    await expect(page.getByText("Browser test clinic address", { exact: true })).toBeVisible();
    await expect(page.locator('a[href="mailto:browser-clinic@example.test"]')).toBeVisible();
    const structured = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(structured.join(" ")).not.toContain("Mo-Fr");
    await page.goto("/privacy-policy");
    await expect(page.getByText("Browser test clinic address", { exact: true })).toBeVisible();
    await expect(page.locator('a[href="mailto:browser-clinic@example.test"]')).toBeVisible();
    await expect(page.locator('a[href="mailto:privacy@aetherdental.ph"]').first()).toBeVisible();

    await page.goto("/admin/configuration");
    await page.getByLabel("Address", { exact: true }).fill("");
    await page.getByLabel("Public phone", { exact: true }).fill("");
    await page.getByLabel("Public email", { exact: true }).fill("");
    saved = page.waitForResponse(response => response.url().endsWith("/api/admin/configuration") && response.request().method() === "PATCH");
    await page.getByRole("button", { name: "Save contact details", exact: true }).click();
    expect((await saved).status()).toBe(200);
    for (const path of ["/", "/privacy-policy"]) {
      await page.goto(path);
      await expect(page.getByText("Clinic address available on request.", { exact: true })).toBeVisible();
      await expect(page.locator('a[href="mailto:browser-clinic@example.test"]')).toHaveCount(0);
      await expect(page.locator('a[href="tel:09123456789"]')).toHaveCount(0);
    }
    await expect(page.locator('a[href="mailto:privacy@aetherdental.ph"]').first()).toBeVisible();
  });

  test("stale saves preserve drafts until the administrator explicitly reloads", async ({ page }) => {
    await page.goto("/admin/configuration");
    const address = page.getByLabel("Address", { exact: true });
    await expect(address).toBeVisible();
    await address.fill("Unsaved local contact");
    await page.getByLabel("Closing time", { exact: true }).fill("16:00");
    const previous = await prisma.clinicSetting.findUniqueOrThrow({ where: { id: "singleton" } });
    await prisma.clinicSetting.update({ where: { id: "singleton" }, data: { address: "Concurrent administrator contact", updatedAt: new Date(previous.updatedAt.getTime() + 1000) } });
    const stale = page.waitForResponse(response => response.url().endsWith("/api/admin/configuration") && response.request().method() === "PATCH");
    await page.getByRole("button", { name: "Save contact details", exact: true }).click();
    expect((await stale).status()).toBe(409);
    await expect(page.getByRole("button", { name: "Reload settings", exact: true })).toBeVisible();
    await expect(address).toHaveValue("Unsaved local contact");
    await expect(page.getByLabel("Closing time", { exact: true })).toHaveValue("16:00");
    expect((await prisma.clinicSetting.findUniqueOrThrow({ where: { id: "singleton" } })).address).toBe("Concurrent administrator contact");
    await page.getByRole("button", { name: "Reload settings", exact: true }).click();
    await expect(address).toHaveValue("Concurrent administrator contact");
    await expect(page.getByLabel("Closing time", { exact: true })).toHaveValue("17:00");
    await expect(page.getByRole("button", { name: "Reload settings", exact: true })).toHaveCount(0);
  });

  test("non-admin staff cannot read or change configuration or clinic closures", async ({ page, context }) => {
    try {
      await prisma.user.update({ where: { id: staffId }, data: { role: "RECEPTIONIST" } });
      for (const path of ["/api/admin/configuration", "/api/admin/clinic-closures"]) {
        expect((await context.request.get(path)).status()).toBe(403);
      }
      expect((await context.request.patch("/api/admin/configuration", { data: {} })).status()).toBe(403);
      expect((await context.request.post("/api/admin/clinic-closures", { data: {} })).status()).toBe(403);
      expect((await context.request.delete("/api/admin/clinic-closures/not-a-closure")).status()).toBe(403);
      await page.goto("/admin/configuration");
      await expect(page).not.toHaveURL(/\/admin\/configuration$/);
    } finally {
      await prisma.user.update({ where: { id: staffId }, data: { role: "ADMIN" } });
    }
  });
});
