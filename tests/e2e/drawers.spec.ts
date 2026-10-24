import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

const patient = { id: "drawer-patient", firstName: "Alexandra", lastName: "Reyes", email: `${"longcontact".repeat(8)}@example.test`, phone: "09123456789", notes: "Synthetic clinical note. ".repeat(180), status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", _count: { appointments: 30 }, appointments: [] };
const dentist = { id: "drawer-dentist", name: "Dr. Clara Santos", email: "clara@example.test", phone: "09123456789", specialization: "General Dentistry", profileImage: null, status: "ACTIVE", createdAt: patient.createdAt, updatedAt: patient.updatedAt, availability: [{ dayOfWeek: "MONDAY", startTime: "09:00", endTime: "17:00", breakStart: null, breakEnd: null, isWorking: true }] };
const history = Array.from({ length: 30 }, (_, index) => ({ id: `history-${index}`, appointmentDate: "2026-10-10T00:00:00Z", startTime: "09:00", endTime: "09:30", status: "COMPLETED", patient, dentist, service: { name: "Dental Cleaning" } }));

async function checkDrawer(page: Page, drawer: Locator) {
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute("aria-labelledby", /.+/);
  expect(await page.locator("body").evaluate(node => getComputedStyle(node).overflow)).toBe("hidden");
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await drawer.evaluate(node => node.contains(document.activeElement))).toBe(true);
  }
  const body = drawer.locator('[data-slot="sheet-body"]');
  const header = drawer.locator('[data-slot="sheet-header"]');
  const footer = drawer.locator('[data-slot="sheet-footer"]');
  const headerBefore = await header.boundingBox();
  const footerBefore = await footer.boundingBox();
  expect(await body.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  await body.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect.poll(() => body.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  expect((await header.boundingBox())?.y).toBe(headerBefore?.y);
  expect((await footer.boundingBox())?.y).toBe(footerBefore?.y);
  const box = await drawer.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  expect(await body.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
}

test.describe("drawer accessibility and responsive layouts", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires an isolated PostgreSQL TEST_DATABASE_URL.");
  let prisma: PrismaClient;
  let staffId: string;
  test.beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    expect(url.pathname.endsWith("_test")).toBe(true);
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    staffId = (await prisma.user.create({ data: { name: "Drawer QA", email: `${randomUUID()}@example.test`, passwordHash: "not-a-login", role: "ADMIN" } })).id;
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
    await page.route("**/api/patients?**", route => route.fulfill({ json: { success: true, data: { patients: [patient], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } } } }));
    await page.route("**/api/patients/drawer-patient", route => route.fulfill({ json: { success: true, data: { patient, stats: { total: 30, completed: 30, cancelled: 0, nextAppointment: null, lastAppointment: history[0] }, history } } }));
    await page.route("**/api/dentists?**", route => route.fulfill({ json: { success: true, data: [dentist] } }));
    await page.route("**/api/dentists/drawer-dentist", route => route.fulfill({ json: { success: true, data: { dentist, stats: { totalAppointments: 30, upcomingCount: 30 }, upcoming: history } } }));
  });

  for (const width of [1440, 390]) {
    for (const theme of ["light", "dark"] as const) {
      for (const profile of [{ path: "patients", title: "Patient Details" }, { path: "dentists", title: "Dentist Details" }]) {
      test(`${profile.path} keep chrome visible, contain focus and restore it: ${width}px ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await page.addInitScript(mode => localStorage.setItem("aether-theme", mode), theme);
          await page.goto(`/admin/${profile.path}`);
          const trigger = page.getByTitle(profile.path === "patients" ? "View patient details" : "View dentist details", { exact: true });
          await trigger.click();
          const drawer = page.getByRole("dialog", { name: profile.title, exact: true });
          await checkDrawer(page, drawer);
          await drawer.locator('[data-slot="sheet-body"]').evaluate(node => { node.scrollTop = 0; });
          await drawer.screenshot({ path: `node_modules/.cache/aether-drawer-qa/drawer-${profile.path}-${width}-${theme}.png` });
          expect(await drawer.evaluate(node => Number.parseFloat(getComputedStyle(node).animationDuration))).toBeLessThanOrEqual(0.001);
          await page.keyboard.press("Escape");
          await expect(drawer).toHaveCount(0);
          await expect(trigger).toBeFocused();
      });
      }
    }
  }

  test("mobile navigation locks scrolling and restores trigger focus on Escape", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 667 });
    await page.goto("/admin/patients");
    const trigger = page.getByRole("button", { name: "Toggle navigation menu" });
    await trigger.click();
    const drawer = page.getByRole("dialog", { name: "Clinic navigation" });
    await expect(drawer).toBeVisible();
    expect(await page.locator("body").evaluate(node => getComputedStyle(node).overflow)).toBe("hidden");
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press("Tab");
      expect(await drawer.evaluate(node => node.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("dropdown opens a profile, overlay dismisses it and normal close keeps an exit animation", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/patients");
    const actionsTrigger = page.getByRole("button", { name: "More actions", exact: true });
    await actionsTrigger.click();
    await page.getByRole("menuitem", { name: "View patient", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Patient Details", exact: true });
    await expect(drawer).toBeVisible();
    await page.locator('[data-slot="sheet-overlay"]').click({ position: { x: 20, y: 20 } });
    await expect(drawer).toHaveCount(0);
    await expect(actionsTrigger).toBeFocused();
    const trigger = page.getByTitle("View patient details", { exact: true });
    await trigger.click();
    await expect(drawer).toBeVisible();
    expect(await drawer.evaluate(node => getComputedStyle(node).animationName)).not.toBe("none");
    const exit = await drawer.evaluate(node => new Promise<boolean>(resolve => {
      const observer = new MutationObserver(() => {
        if (node.getAttribute("data-state") === "closed") {
          observer.disconnect();
          resolve(node.isConnected && getComputedStyle(node).animationName !== "none");
        }
      });
      observer.observe(node, { attributes: true, attributeFilter: ["data-state"] });
      (node.querySelector('[aria-label="Close patient details"]') as HTMLButtonElement).click();
    }));
    expect(exit).toBe(true);
    await expect(drawer).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("reopening the same patient recovers after an initial fetch failure", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/patients/drawer-patient", async route => {
      if (calls++ === 0) return route.fulfill({ status: 500, json: { message: "Temporary synthetic failure" } });
      return route.fulfill({ json: { success: true, data: { patient, stats: { total: 30, completed: 30, cancelled: 0, nextAppointment: null, lastAppointment: history[0] }, history } } });
    });
    await page.goto("/admin/patients");
    const trigger = page.getByTitle("View patient details", { exact: true });
    await trigger.click();
    await expect(page.getByText("Temporary synthetic failure", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await trigger.click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Alexandra Reyes", exact: true })).toBeVisible();
    await expect(page.getByText("Temporary synthetic failure", { exact: true })).toHaveCount(0);
  });

  test("calendar appointment drawer scrolls long notes independently", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 667 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/appointments?**", route => {
      const date = new URL(route.request().url()).searchParams.get("from")!;
      return route.fulfill({ json: { success: true, data: { items: [{ ...history[0], appointmentDate: `${date}T00:00:00Z`, referenceNumber: "APT-DRAWER", notes: patient.notes }] } } });
    });
    await page.goto("/admin/calendar");
    await page.getByRole("button", { name: /, 1 appointments$/ }).click();
    const trigger = page.getByRole("button", { name: /Alexandra Reyes.*Dental Cleaning/ });
    await trigger.click();
    const drawer = page.getByRole("dialog", { name: "Appointment Details", exact: true });
    await checkDrawer(page, drawer);
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});
