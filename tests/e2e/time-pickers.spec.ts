import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

async function chooseTime(page: Page, label: string, value: string) {
  await timeTrigger(page, label).click();
  const popup = page.getByRole("dialog");
  const [hours, minutes] = value.split(":");
  for (const [part, option] of [["Hour", hours], ["Minute", minutes]]) {
    await popup.getByRole("listbox", { name: part, exact: true }).getByRole("option", { name: option, exact: true }).click();
  }
  await popup.getByRole("button", { name: "OK", exact: true }).click();
  await expect(popup).toHaveCount(0);
}

function timeTrigger(page: Page, label: string) {
  return page.getByRole("button", { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: |$)`) });
}

async function clearTime(page: Page, label: string) {
  await timeTrigger(page, label).click();
  const popup = page.getByRole("dialog");
  await popup.getByRole("button", { name: "Clear", exact: true }).click();
  await popup.getByRole("button", { name: "OK", exact: true }).click();
  await expect(popup).toHaveCount(0);
}

test.describe("admin time pickers", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires an isolated PostgreSQL TEST_DATABASE_URL.");
  let prisma: PrismaClient;
  let staffId: string;
  let dentistId: string;
  const marker = randomUUID();
  test.beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    expect(url.pathname.endsWith("_test")).toBe(true);
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    expect(await prisma.clinicSetting.count(), "Use an empty disposable database.").toBe(0);
    staffId = (await prisma.user.create({ data: { name: "Time picker QA", email: `${marker}@example.test`, passwordHash: "not-a-login", role: "ADMIN" } })).id;
    dentistId = (await prisma.dentist.create({ data: { name: "Dr. Time Picker", email: `${marker}-dentist@example.test`, specialization: "General Dentistry" } })).id;
    await prisma.clinicSetting.create({ data: { id: "singleton", name: "Aether Dental", address: "Synthetic time picker QA", openingTime: "09:07", closingTime: "17:53" } });
  });
  test.afterAll(async () => {
    if (!prisma) return;
    if (staffId) {
      await prisma.activity.deleteMany({ where: { userId: staffId } });
      await prisma.clinicSetting.delete({ where: { id: "singleton" } });
      if (dentistId) {
        await prisma.availability.deleteMany({ where: { dentistId } });
        await prisma.dentist.delete({ where: { id: dentistId } });
      }
      await prisma.user.delete({ where: { id: staffId } });
    }
    await prisma.$disconnect();
  });
  test.beforeEach(async ({ context, page }) => {
    const name = "authjs.session-token";
    const value = await encode({ token: { id: staffId, role: "ADMIN" }, secret: process.env.NEXTAUTH_SECRET || "isolated-browser-regression-secret", salt: name });
    await context.addCookies([{ name, value, url: "http://127.0.0.1:3100", httpOnly: true, sameSite: "Lax" }]);
    await page.route("**/api/notifications**", route => route.fulfill({ json: { success: true, data: { items: [], unreadCount: 0, count: 0 } } }));
  });

  test("clinic preserves minute precision, accepts midnight, clears optional times and disables while saving", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/configuration");
    await expect(timeTrigger(page, "Opening time")).toContainText("09:07");
    await timeTrigger(page, "Opening time").click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Clear", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(timeTrigger(page, "Opening time")).toBeFocused();
    await chooseTime(page, "Opening time", "00:00");
    await chooseTime(page, "Lunch starts (optional)", "12:07");
    await chooseTime(page, "Lunch ends (optional)", "13:53");
    await clearTime(page, "Lunch starts (optional)");
    await clearTime(page, "Lunch ends (optional)");
    await expect(timeTrigger(page, "Lunch starts (optional)")).not.toContainText("12:07");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: "node_modules/.cache/aether-reui-time-picker-qa/configuration-mobile.png", fullPage: true });

    let releaseSave!: () => void;
    const saving = new Promise<void>(resolve => { releaseSave = resolve; });
    await page.route("**/api/admin/configuration", async route => {
      if (route.request().method() === "PATCH") await saving;
      await route.continue();
    });
    const request = page.waitForRequest(req => req.url().endsWith("/api/admin/configuration") && req.method() === "PATCH");
    const response = page.waitForResponse(res => res.url().endsWith("/api/admin/configuration") && res.request().method() === "PATCH");
    await page.getByRole("button", { name: "Save operating hours", exact: true }).click();
    expect((await request).postDataJSON()).toMatchObject({ openingTime: "00:00", closingTime: "17:53", lunchBreakStart: null, lunchBreakEnd: null });
    try {
      await expect(timeTrigger(page, "Opening time")).toBeDisabled();
    } finally {
      releaseSave();
    }
    expect((await response).status()).toBe(200);
    const persisted = await prisma.clinicSetting.findUniqueOrThrow({ where: { id: "singleton" } });
    expect(persisted).toMatchObject({ openingTime: "00:00", closingTime: "17:53", lunchBreakStart: null, lunchBreakEnd: null });
  });

  test("dentist picker supports keyboard selection, mobile popups and exact HH:mm saves", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("aether-theme", "dark"));
    await page.goto(`/admin/dentists/${dentistId}`);
    await chooseTime(page, "Monday start time", "09:07");
    const trigger = timeTrigger(page, "Monday start time");
    await trigger.focus();
    await page.keyboard.press("Enter");
    const popupDialog = page.getByRole("dialog");
    const minutes = popupDialog.getByRole("listbox", { name: "Minute", exact: true });
    await expect(minutes).toBeVisible();
    await expect(minutes.getByRole("option")).toHaveCount(60);
    await expect(popupDialog.getByRole("listbox", { name: "Hour", exact: true }).getByRole("option")).toHaveCount(24);
    const popup = await popupDialog.boundingBox();
    expect(popup!.x).toBeGreaterThanOrEqual(0);
    expect(popup!.x + popup!.width).toBeLessThanOrEqual(391);
    expect(popup!.y + popup!.height).toBeLessThanOrEqual(845);
    await page.screenshot({ path: "node_modules/.cache/aether-reui-time-picker-qa/schedule-popup-mobile-dark.png" });
    await minutes.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown");
    await expect(minutes.getByRole("option", { name: "01", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(popupDialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await chooseTime(page, "Monday start time", "09:07");
    await chooseTime(page, "Monday end time", "17:53");
    await chooseTime(page, "Monday break start", "12:07");
    await chooseTime(page, "Monday break end", "13:53");
    await clearTime(page, "Monday break start");
    await clearTime(page, "Monday break end");
    await page.screenshot({ path: "node_modules/.cache/aether-reui-time-picker-qa/schedule-mobile.png", fullPage: true });
    const response = page.waitForResponse(res => res.url().endsWith(`/api/dentists/${dentistId}/availability`) && res.request().method() === "PUT");
    await page.getByRole("button", { name: "Save Schedule", exact: true }).click();
    const saved = await response;
    expect(saved.status()).toBe(200);
    expect(saved.request().postDataJSON().availability).toContainEqual({ dayOfWeek: "MONDAY", isWorking: true, startTime: "09:07", endTime: "17:53", breakStart: null, breakEnd: null });
    expect(await prisma.availability.findUniqueOrThrow({ where: { dentistId_dayOfWeek: { dentistId, dayOfWeek: "MONDAY" } } })).toMatchObject({ startTime: "09:07", endTime: "17:53", breakStart: null, breakEnd: null });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
});
