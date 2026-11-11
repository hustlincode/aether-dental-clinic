import { clinicRequest } from "../helpers/clinic-request";
import { randomUUID } from "node:crypto";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient, type Role } from "@prisma/client";
import { encode } from "next-auth/jwt";

test.describe("staff user management", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires an isolated PostgreSQL TEST_DATABASE_URL.");
  let prisma: PrismaClient;
  const marker = randomUUID();
  const accounts = new Map<Role, string>();
  let dentistId: string;

  async function authenticate(context: BrowserContext, role: Role) {
    const name = "authjs.session-token";
    const value = await encode({ token: { tenantId: "aether", id: accounts.get(role), role, sessionVersion: 0 }, secret: process.env.NEXTAUTH_SECRET || "isolated-browser-regression-secret", salt: name });
    await context.addCookies([{ name, value, url: "http://aether.localhost:3100", httpOnly: true, sameSite: "Lax" }]);
  }

  async function select(page: Page, label: string, option: string) {
    await page.getByLabel(label, { exact: true }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  }

  test.beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    expect(url.pathname.endsWith("_test")).toBe(true);
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    for (const role of ["ADMIN", "RECEPTIONIST", "ASSISTANT", "DENTIST"] as Role[]) {
      const user = await prisma.user.create({ data: { tenantId: "aether", name: `Browser ${role}`, email: `${marker}-${role.toLowerCase()}@example.test`, role, passwordHash: "not-a-login" } });
      accounts.set(role, user.id);
    }
    dentistId = (await prisma.dentist.create({ data: { tenantId: "aether", name: `Dr Browser ${marker}`, email: `${marker}-profile@example.test`, specialization: "General Dentistry" } })).id;
  });

  test.afterAll(async () => {
    if (!prisma) return;
    const users = await prisma.user.findMany({ where: { email: { startsWith: marker } }, select: { id: true } });
    const ids = users.map(user => user.id);
    await prisma.dentist.updateMany({ where: { userId: { in: ids } }, data: { userId: null } });
    await prisma.activity.deleteMany({ where: { userId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    if (dentistId) await prisma.dentist.delete({ where: { id: dentistId } });
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/notifications**", route => route.fulfill({ json: { success: true, data: { items: [], unreadCount: 0, count: 0 } } }));
  });

  test("admin creates, edits, links, resets and disables a staff account", async ({ page, context }) => {
    await authenticate(context, "ADMIN");
    const email = `${marker}-managed@example.test`;
    const name = `Managed ${marker}`;
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Add user", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add user", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Add user", exact: true }).click();
    let dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Full name", { exact: true })).toBeFocused();
    await dialog.getByLabel("Full name", { exact: true }).fill(name);
    await dialog.getByLabel("Email", { exact: true }).fill(email.toUpperCase());
    await dialog.getByLabel("Password", { exact: true }).fill("Browser passphrase 2026!");
    await dialog.getByRole("button", { name: "Create user", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByPlaceholder("Search users...").fill(email);
    let row = page.getByRole("row").filter({ hasText: email });
    await expect(row).toContainText("Front-desk");
    await row.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Edit user", exact: true }).click();
    dialog = page.getByRole("dialog");
    await select(page, "Role", "Assistant");
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toContainText("Assistant");
    await row.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Edit user", exact: true }).click();
    await select(page, "Role", "Dentist");
    await expect(page.getByLabel("Dentist profile", { exact: true })).toBeEnabled();
    await select(page, "Dentist profile", `Dr Browser ${marker}`);
    await page.getByRole("dialog").getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(row).toContainText(`Dr Browser ${marker}`);
    const managed = await prisma.user.findFirstOrThrow({ where: { tenantId: "aether", email } });
    expect((await prisma.dentist.findUniqueOrThrow({ where: { id: dentistId } })).userId).toBe(managed.id);

    await row.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Reset password", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("New password", { exact: true }).fill("short");
    await dialog.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(dialog.getByText("Check the highlighted fields.", { exact: true })).toBeFocused();
    await expect(dialog.getByText("Use at least 12 characters.", { exact: true })).toBeVisible();
    await dialog.getByLabel("New password", { exact: true }).fill("Replacement passphrase 2026!");
    await dialog.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect((await prisma.user.findFirstOrThrow({ where: { tenantId: "aether", email } })).sessionVersion).toBeGreaterThan(managed.sessionVersion);

    await page.setViewportSize({ width: 390, height: 844 });
    row = page.getByRole("row").filter({ hasText: email });
    await row.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Deactivate login", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Deactivate login", exact: true }).click();
    await expect(row).toContainText("Inactive");
    expect((await prisma.dentist.findUniqueOrThrow({ where: { id: dentistId } })).status).toBe("ACTIVE");
    await select(page, "login statuses", "Active");
    await expect(page.getByText("No users found", { exact: true })).toBeVisible();
    await select(page, "login statuses", "Inactive");
    await expect(page.getByRole("row").filter({ hasText: email })).toBeVisible();
  });

  test("Admin rows are read-only and non-admin roles cannot access user management", async ({ page, context }) => {
    await authenticate(context, "ADMIN");
    await page.goto("/admin/users");
    await page.getByPlaceholder("Search users...").fill(`${marker}-admin@example.test`);
    const row = page.getByRole("row").filter({ hasText: `${marker}-admin@example.test` });
    await expect(row).toContainText("Read-only");
    await expect(row.getByRole("button")).toHaveCount(0);
    for (const role of ["RECEPTIONIST", "ASSISTANT", "DENTIST"] as Role[]) {
      await authenticate(context, role);
      expect((await clinicRequest(context, "/api/admin/users")).status()).toBe(403);
      expect((await clinicRequest(context, "/api/admin/users", { method: "POST", data: {} })).status()).toBe(403);
      await page.goto("/admin/users");
      await expect(page).toHaveURL(/\/admin$/);
      await expect(page.getByRole("link", { name: "Users", exact: true })).toHaveCount(0);
    }
  });

  test("password reset and deactivate/reactivate revoke saved sessions while the new password works", async ({ context, browser }) => {
    await authenticate(context, "ADMIN");
    const email = `${marker}-session@example.test`;
    const created = await clinicRequest(context, "/api/admin/users", { method: "POST", data: {
      name: "Session browser test", email, role: "ASSISTANT", password: "Original browser password!",
    } });
    expect(created.status()).toBe(201);
    const account = (await created.json()).data;
    const staff = await browser.newContext();
    try {
      const name = "authjs.session-token";
      const value = await encode({ token: { tenantId: "aether", id: account.id, role: "ASSISTANT", sessionVersion: 0 }, secret: process.env.NEXTAUTH_SECRET || "isolated-browser-regression-secret", salt: name });
      await staff.addCookies([{ name, value, url: "http://aether.localhost:3100", httpOnly: true, sameSite: "Lax" }]);
      expect((await clinicRequest(staff, "/api/notifications/unread-count")).status()).toBe(200);
      expect((await clinicRequest(context, `/api/admin/users/${account.id}/password`, { method: "POST", data: { password: "Replacement browser password!" } })).status()).toBe(200);
      expect((await clinicRequest(staff, "/api/notifications/unread-count")).status()).toBe(401);
      await staff.clearCookies();
      const page = await staff.newPage();
      await page.goto("/login");
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill("Original browser password!");
      await page.getByRole("button", { name: /^Sign in$/i }).click();
      await expect(page.locator("#login-error")).toHaveText("Invalid email or password.");
      await page.getByLabel("Password", { exact: true }).fill("Replacement browser password!");
      await page.getByRole("button", { name: /^Sign in$/i }).click();
      await expect(page).toHaveURL(/\/admin$/);
      const saved = await staff.cookies();
      expect((await clinicRequest(context, `/api/admin/users/${account.id}`, { method: "PATCH", data: { active: false } })).status()).toBe(200);
      expect((await clinicRequest(staff, "/api/notifications/unread-count")).status()).toBe(401);
      expect((await clinicRequest(context, `/api/admin/users/${account.id}`, { method: "PATCH", data: { active: true } })).status()).toBe(200);
      await staff.addCookies(saved);
      expect((await clinicRequest(staff, "/api/notifications/unread-count")).status()).toBe(401);
    } finally { await staff.close(); }
  });

  test("Assistant sees clinical actions and submits appointment notes only", async ({ page, context }) => {
    await authenticate(context, "ASSISTANT");
    const appointment = {
      id: "assistant-browser-appointment", referenceNumber: "APT-assistant-browser", appointmentDate: "2099-01-05T00:00:00Z",
      startTime: "09:00", endTime: "09:30", status: "CONFIRMED", notes: "",
      patient: { firstName: "Browser", lastName: "Patient", phone: "09123456789", email: null },
      dentist: { id: dentistId, name: "Dr Browser" }, dentistId, service: { id: "service", name: "Cleaning" }, serviceId: "service",
    };
    let schedulingRequests = 0;
    await page.route("**/api/services?**", route => { schedulingRequests++; return route.fulfill({ json: { success: true, data: [] } }); });
    await page.route("**/api/availability/slots?**", route => { schedulingRequests++; return route.fulfill({ json: { success: true, data: [] } }); });
    await page.route("**/api/appointments?**", route => route.fulfill({ json: { success: true, data: { items: [appointment], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } } } }));
    let payload: unknown;
    await page.route(`**/api/appointments/${appointment.id}`, route => { payload = route.request().postDataJSON(); return route.fulfill({ json: { success: true, data: appointment } }); });
    await page.goto("/admin/appointments");
    await expect(page.getByRole("button", { name: "Check In", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark No Show", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: `Edit appointment ${appointment.referenceNumber}`, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Edit appointment notes", exact: true })).toBeVisible();
    await expect(dialog.getByLabel("Date", { exact: true })).toHaveCount(0);
    await expect(dialog.getByLabel("First name", { exact: true })).toHaveCount(0);
    await dialog.getByLabel("Notes", { exact: true }).fill("Clinical browser note");
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(payload).toEqual({ notes: "Clinical browser note" });
    expect(schedulingRequests).toBe(0);
  });
});
