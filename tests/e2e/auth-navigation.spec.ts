import { randomUUID } from "node:crypto";
import { test, expect, type Page, type Request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const demoEnabled = process.env.E2E_DEMO_ENABLED === "true";
const demoEmail = "notification-demo@example.test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /^Sign in$/i }).click();
}

function isDashboardNavigation(request: Request) {
  const url = new URL(request.url());
  return url.pathname === "/admin" && request.method() === "GET" &&
    request.headers()["next-router-prefetch"] !== "1" && request.headers().purpose !== "prefetch";
}

test.describe("authentication navigation", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires an isolated PostgreSQL TEST_DATABASE_URL.");
  let prisma: PrismaClient;
  const users: { id: string; email: string; password: string }[] = [];

  test.beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    expect(url.pathname.endsWith("_test")).toBe(true);
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    for (let i = 0; i < (demoEnabled ? 1 : 2); i++) {
      const password = randomUUID();
      const email = demoEnabled ? demoEmail : `${randomUUID()}@example.test`;
      const user = await prisma.user.create({ data: {
        name: demoEnabled ? "Notification Demo Test" : `Navigation ${i}`,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: demoEnabled ? "ADMIN" : "DENTIST",
      } });
      users.push({ id: user.id, email, password });
      const prefix = demoEnabled ? "Owned Demo" : i === 0 ? "Owned A" : "Owned B";
      await prisma.notification.createMany({ data: Array.from({ length: demoEnabled ? 3 : i === 0 ? 2 : 5 }, (_, index) => ({
        userId: user.id,
        type: "APPOINTMENT_CREATED" as const,
        title: "Navigation test",
        message: `${prefix} notification ${index + 1}`,
        entityType: "appointment",
      })) });
    }
  });

  test.afterAll(async () => {
    if (!prisma) return;
    const ids = users.map((user) => user.id);
    if (ids.length) {
      await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
  });

  test("staff sign-in makes one dashboard navigation and rejects repeated submissions", async ({ page }) => {
    test.skip(demoEnabled, "Covered on the demo-disabled server.");
    const dashboard: Request[] = [];
    let unreadRequests = 0;
    let listRequests = 0;
    let signInRequests = 0;
    let releaseSignIn!: () => void;
    const gate = new Promise<void>((resolve) => { releaseSignIn = resolve; });
    page.on("request", (request) => {
      if (isDashboardNavigation(request)) dashboard.push(request);
      const url = new URL(request.url());
      if (url.pathname === "/api/notifications/unread-count") unreadRequests++;
      if (url.pathname === "/api/notifications") listRequests++;
    });
    await page.route(url => url.pathname === "/api/auth/callback/credentials", async (route) => {
      signInRequests++;
      await gate;
      await route.continue();
    });
    await login(page, users[0].email, users[0].password);
    await expect.poll(() => signInRequests).toBe(1);
    await expect(page.getByRole("button", { name: /^Signing in/i })).toBeDisabled();
    await page.locator("form").evaluate((form) => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    releaseSignIn();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Notifications, 2 unread", exact: true })).toBeVisible();
    expect(signInRequests).toBe(1);
    expect(dashboard.map((request) => request.resourceType())).toEqual(["document"]);
    expect(unreadRequests).toBe(1);
    expect(listRequests).toBe(0);
  });

  test("failed credentials retain the login form and never navigate to admin", async ({ page }) => {
    test.skip(demoEnabled, "Covered on the demo-disabled server.");
    const dashboard: Request[] = [];
    page.on("request", (request) => { if (isDashboardNavigation(request)) dashboard.push(request); });
    await login(page, users[0].email, "incorrect-password");
    await expect(page.locator("#login-error")).toHaveText("Invalid email or password.");
    await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
    await expect(page.getByRole("button", { name: /^Sign in$/i })).toBeEnabled();
    await expect(page).toHaveURL(/\/login$/);
    expect(dashboard).toEqual([]);
  });

  test("logout and another account login replace cached notification state", async ({ page }) => {
    test.skip(demoEnabled, "Covered on the demo-disabled server.");
    await login(page, users[0].email, users[0].password);
    await page.getByRole("button", { name: "Notifications, 2 unread", exact: true }).click();
    await expect(page.getByText("Owned A notification 1", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    const logoutPages: Request[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname === "/login" && request.method() === "GET") logoutPages.push(request);
    });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("alertdialog", { name: "Log out", exact: true }).getByRole("button", { name: "Log Out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    expect(logoutPages.map((request) => request.resourceType())).toEqual(["document"]);
    await page.getByLabel("Email", { exact: true }).fill(users[1].email);
    await page.getByLabel("Password", { exact: true }).fill(users[1].password);
    await page.getByRole("button", { name: /^Sign in$/i }).click();
    await page.getByRole("button", { name: "Notifications, 5 unread", exact: true }).click();
    await expect(page.getByText("Owned B notification 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Owned A notification 1", { exact: true })).toHaveCount(0);
  });

  test("demo sign-in navigates once and notification interaction stays read-only", async ({ page }) => {
    test.skip(!demoEnabled, "Requires the dedicated demo-enabled server.");
    const dashboard: Request[] = [];
    let unreadRequests = 0;
    let writes = 0;
    page.on("request", (request) => {
      if (isDashboardNavigation(request)) dashboard.push(request);
      const url = new URL(request.url());
      if (url.pathname === "/api/notifications/unread-count") unreadRequests++;
      if (url.pathname.startsWith("/api/notifications") && request.method() === "PATCH") writes++;
    });
    await page.goto("/login");
    await page.getByRole("button", { name: /Explore the demo dashboard/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    const bell = page.getByRole("button", { name: "Notifications, 3 unread", exact: true });
    await expect(bell).toBeVisible();
    expect(dashboard.map((request) => request.resourceType())).toEqual(["document"]);
    expect(unreadRequests).toBe(1);
    await bell.click();
    await expect(page.getByText("Owned Demo notification 1", { exact: true })).toBeVisible();
    const markAll = page.getByRole("button", { name: /Mark all as read/i });
    if (await markAll.count()) await expect(markAll).toBeDisabled();
    await page.getByText("Owned Demo notification 1", { exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/appointments$/);
    expect(writes).toBe(0);
    expect(await prisma.notification.count({ where: { userId: users[0].id, isRead: false } })).toBe(3);
  });
});
