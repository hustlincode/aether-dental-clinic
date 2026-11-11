import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

const viewports = [
  { width: 1440, height: 500, theme: "light" },
  { width: 390, height: 520, theme: "dark" },
  { width: 390, height: 300, theme: "light" },
] as const;

async function checkLayout(page: Page, dialog: Locator, scroll = false) {
  await expect(dialog).toBeVisible();
  await dialog.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))));
  const prefix = await dialog.getAttribute("role") === "alertdialog" ? "alert-dialog" : "dialog";
  const header = dialog.locator(`[data-slot="${prefix}-header"]`);
  const body = dialog.locator(`[data-slot="${prefix}-body"]`);
  const footer = dialog.locator(`[data-slot="${prefix}-footer"]`);
  await expect(header).toBeVisible();
  await expect(body).toBeVisible();
  await expect(footer).toBeVisible();
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(15);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width - 15);
  expect(bounds!.y).toBeGreaterThanOrEqual(15);
  expect(bounds!.height).toBeLessThanOrEqual(viewport.height * 0.9 + 2);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height - 15);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  for (const button of await footer.getByRole("button").all()) await expect(button).toBeInViewport();
  if (scroll) {
    expect(await body.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    const beforeHeader = await header.boundingBox();
    const beforeFooter = await footer.boundingBox();
    await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect(await body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    expect(await header.boundingBox()).toEqual(beforeHeader);
    expect(await footer.boundingBox()).toEqual(beforeFooter);
    expect(await dialog.evaluate(element => element.scrollTop)).toBe(0);
  }
}

test.describe("standard admin dialogs", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires an isolated PostgreSQL TEST_DATABASE_URL.");
  let prisma: PrismaClient;
  let staffId: string;

  test.beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    expect(url.pathname.endsWith("_test")).toBe(true);
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    staffId = (await prisma.user.create({ data: { tenantId: "aether",
      name: "Modal layout test", email: `${randomUUID()}@example.test`, role: "ADMIN", passwordHash: "not-a-login",
    } })).id;
  });

  test.afterAll(async () => {
    if (!prisma) return;
    if (staffId) await prisma.user.delete({ where: { id: staffId } });
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ context, page, baseURL }) => {
    const name = "authjs.session-token";
    const value = await encode({ token: { tenantId: "aether", id: staffId, role: "ADMIN", sessionVersion: 0 }, secret: process.env.NEXTAUTH_SECRET || "isolated-browser-regression-secret", salt: name });
    await context.addCookies([{ name, value, url: baseURL!, httpOnly: true, sameSite: "Lax" }]);
    await page.route("**/api/notifications**", route => route.fulfill({ json: { success: true, data: { items: [], unreadCount: 0, count: 0 } } }));
    await page.route("**/api/dentists?all=true", route => route.fulfill({ json: { success: true, data: [] } }));
    await page.route("**/api/services?all=true", route => route.fulfill({ json: { success: true, data: [] } }));
    await page.route("**/api/patients?**", route => route.fulfill({ json: { success: true, data: { patients: [], total: 0 } } }));
    await page.route("**/api/admin/users?**", route => route.fulfill({ json: { success: true, data: { users: [], total: 0 } } }));
  });

  for (const viewport of viewports) {
    test(`forms retain header and actions while scrolling: ${viewport.width}x${viewport.height} ${viewport.theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: viewport.theme, reducedMotion: "reduce" });
      await page.addInitScript(theme => localStorage.setItem("aether-theme", theme), viewport.theme);
      for (const [path, trigger, title] of [
        ["dentists", "Add Dentist", "Add New Dentist"],
        ["patients", "Add Patient", "Add New Patient"],
        ["services", "Add Service", "Add New Service"],
        ["users", "Add user", "Add user"],
      ]) {
        await page.goto(`/admin/${path}`);
        await page.getByRole("button", { name: trigger, exact: true }).first().click();
        const dialog = page.getByRole("dialog", { name: title, exact: true });
        await checkLayout(page, dialog, true);
        if (path !== "users") {
          await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeVisible();
          await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
        }
        if (path === "dentists" && viewport.width === 390 && viewport.theme === "dark") {
          await dialog.screenshot({ path: testInfo.outputPath("dentist-modal-mobile-dark.png") });
        }
        await page.keyboard.press("Tab");
        expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        if (path === "users") await expect(page.getByRole("button", { name: trigger, exact: true })).toBeFocused();
      }
    });
  }

  test("user edit and password reset preserve validation and the Add user focus fallback", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 520 });
    const user = { id: "modal-staff", name: "Modal Staff", email: "modal@example.test", role: "RECEPTIONIST", active: true, dentist: null, isProtected: false };
    await page.route("**/api/admin/users?**", route => route.fulfill({ json: { success: true, data: { users: [user], total: 1 } } }));
    await page.goto("/admin/users");
    const actions = page.getByRole("button", { name: "Actions for Modal Staff", exact: true });
    const addUser = page.getByRole("button", { name: "Add user", exact: true });
    await actions.click();
    await page.getByRole("menuitem", { name: "Edit user", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edit user", exact: true });
    await checkLayout(page, edit, true);
    await edit.getByLabel("Role", { exact: true }).click();
    await page.getByRole("option", { name: "Assistant", exact: true }).click();
    await expect(edit.getByLabel("Role", { exact: true })).toContainText("Assistant");
    await edit.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(addUser).toBeFocused();
    await actions.click();
    await page.getByRole("menuitem", { name: "Reset password", exact: true }).click();
    const reset = page.getByRole("dialog", { name: "Reset password", exact: true });
    await checkLayout(page, reset);
    await reset.getByLabel("New password", { exact: true }).fill("short");
    await reset.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(reset.getByText("Check the highlighted fields.", { exact: true })).toBeFocused();
    await expect(reset.getByText("Use at least 12 characters.", { exact: true })).toBeVisible();
    await reset.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(addUser).toBeFocused();
  });

  test("appointment editing and confirmations use separate body and action sections", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 520 });
    const appointment = { id: "modal-appointment", referenceNumber: "APT-modal", appointmentDate: "2099-01-05T00:00:00Z", startTime: "09:00", endTime: "09:30", status: "CONFIRMED", notes: "", dentistId: "dentist", serviceId: "service", patient: { firstName: "Modal", lastName: "Patient", email: null, phone: "09123456789" }, dentist: { id: "dentist", name: "Dr Modal" }, service: { id: "service", name: "Cleaning" } };
    await page.route("**/api/appointments?**", route => route.fulfill({ json: { success: true, data: { items: [appointment], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } } } }));
    await page.route("**/api/availability/slots?**", route => route.fulfill({ json: { success: true, data: [{ start: "09:00", end: "09:30" }] } }));
    await page.goto("/admin/appointments");
    await page.getByRole("button", { name: "Edit appointment APT-modal", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edit appointment", exact: true });
    await checkLayout(page, edit, true);
    await edit.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const cancel = page.getByRole("alertdialog", { name: "Cancel appointment", exact: true });
    await checkLayout(page, cancel);
    await page.mouse.click(1, 1);
    await expect(cancel).toBeVisible();
    await cancel.getByRole("button", { name: "Keep appointment", exact: true }).click();
    await expect(cancel).toHaveCount(0);
    await page.getByRole("button", { name: "Open user menu", exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    const logout = page.getByRole("alertdialog", { name: "Log out", exact: true });
    await checkLayout(page, logout);
    await logout.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(logout).toHaveCount(0);
  });
});

for (const viewport of viewports) {
  test(`booking consent keeps its actions visible while reading: ${viewport.width}x${viewport.height} ${viewport.theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: viewport.theme, reducedMotion: "reduce" });
    await page.addInitScript(theme => localStorage.setItem("aether-theme", theme), viewport.theme);
    await page.clock.setFixedTime(new Date("2027-01-01T00:00:00Z"));
    await page.route("**/api/services", route => route.fulfill({ json: { success: true, data: [{ id: "service", name: "Test Cleaning", durationMin: 30, price: 500, status: "ACTIVE" }] } }));
    await page.route("**/api/dentists?view=booking", route => route.fulfill({ json: { success: true, data: [{ id: "dentist", name: "Dr Test", specialization: "General", status: "ACTIVE", profileImage: null }] } }));
    await page.route("**/api/availability/dates?**", route => route.fulfill({ json: { success: true, data: ["2027-01-05"] } }));
    await page.route("**/api/availability/slots?**", route => route.fulfill({ json: { success: true, data: [{ start: "09:00", end: "09:30" }] } }));
    await page.goto("/book");
    await page.getByRole("button", { name: /Test Cleaning/ }).click();
    await page.getByRole("button", { name: /Dr Test/ }).click();
    await page.getByRole("button", { name: "5", exact: true }).click();
    await page.getByRole("button", { name: "9:00 AM", exact: true }).click();
    await page.getByLabel("First name", { exact: true }).fill("Modal");
    await page.getByLabel("Last name", { exact: true }).fill("Patient");
    const trigger = page.getByRole("button", { name: /Review.*privacy|Read.*consent|privacy.*consent/i });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Data Privacy Consent", exact: true });
    await checkLayout(page, dialog, true);
    if (viewport.width === 390 && viewport.theme === "dark") {
      await dialog.screenshot({ path: testInfo.outputPath("booking-consent-mobile-dark.png") });
    }
    const close = dialog.getByRole("button", { name: "Close", exact: true });
    await expect(close).toBeVisible();
    await expect(close).toBeInViewport();
    await close.click();
    await expect(dialog).toHaveCount(0);
    await trigger.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "I agree", exact: true }).click();
    await expect(dialog.getByText("Please read and check the consent box to continue.", { exact: true })).toBeVisible();
    await dialog.getByRole("checkbox").check();
    await dialog.getByLabel(/Electronic signature/).fill("Modal Patient");
    await dialog.getByRole("button", { name: "I agree", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}
