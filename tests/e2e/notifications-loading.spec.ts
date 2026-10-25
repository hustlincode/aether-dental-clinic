import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import type { NotificationItem } from "../../src/lib/client-notifications";

function notice(index: number, isRead = false): NotificationItem {
  return {
    id: `notice-${index}`, type: "APPOINTMENT_CREATED", title: "Notification test",
    message: `Notification message ${index}`, entityType: "appointment", entityId: null,
    isRead, readAt: isRead ? "2026-10-24T00:00:00.000Z" : null,
    createdAt: "2026-10-24T00:00:00.000Z",
  };
}

function history(items: NotificationItem[], unreadCount: number, page = 1, total = items.length) {
  return { success: true, data: { items, unreadCount, page, pageSize: 20, total, totalPages: Math.ceil(total / 20) } };
}

test.describe("notification request ownership", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires an isolated PostgreSQL TEST_DATABASE_URL.");
  let prisma: PrismaClient;
  let staffId: string;

  test.beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    expect(url.pathname.endsWith("_test")).toBe(true);
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    staffId = (await prisma.user.create({ data: { name: "Notification browser test", email: `${randomUUID()}@example.test`, passwordHash: "not-a-login", role: "DENTIST" } })).id;
  });

  test.afterAll(async () => {
    if (!prisma) return;
    if (staffId) await prisma.user.delete({ where: { id: staffId } });
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ context, page, baseURL }) => {
    const name = "authjs.session-token";
    const value = await encode({ token: { id: staffId, role: "DENTIST" }, secret: process.env.NEXTAUTH_SECRET || "isolated-browser-regression-secret", salt: name });
    await context.addCookies([{ name, value, url: baseURL || "http://127.0.0.1:3100", httpOnly: true, sameSite: "Lax" }]);
    await page.route("**/api/appointments?**", route => route.fulfill({ json: { success: true, data: { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } } }));
  });

  test("one initial badge request survives navigation focus and idle without loading the preview", async ({ page }) => {
    let counts = 0;
    let lists = 0;
    await page.clock.install();
    await page.route("**/api/notifications**", route => {
      if (new URL(route.request().url()).pathname.endsWith("/unread-count")) {
        counts++;
        return route.fulfill({ json: { success: true, data: { count: 4 } } });
      }
      lists++;
      return route.fulfill({ json: { success: true, data: { items: [], unreadCount: 4 } } });
    });
    await page.goto("/admin");
    await expect(page.getByRole("button", { name: "Notifications, 4 unread", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Appointments", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Appointments", exact: true })).toBeVisible();
    await page.evaluate(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("focus")); });
    await page.clock.fastForward(120_000);
    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Notifications, 4 unread", exact: true })).toBeVisible();
    expect(counts).toBe(1);
    expect(lists).toBe(0);
  });

  test("direct history supplies the badge count and preserves flat pagination and unread filters", async ({ page }) => {
    let countRequests = 0;
    const requested: URL[] = [];
    const items = Array.from({ length: 21 }, (_, index) => notice(index, index >= 3));
    await page.route("**/api/notifications**", route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/unread-count")) {
        countRequests++;
        return route.fulfill({ json: { success: true, data: { count: 99 } } });
      }
      requested.push(url);
      const number = Number(url.searchParams.get("page"));
      const filtered = url.searchParams.get("unread") === "1" ? items.filter((item) => !item.isRead) : items;
      return route.fulfill({ json: history(filtered.slice((number - 1) * 20, number * 20), 3, number, filtered.length) });
    });
    await page.goto("/admin/notifications");
    const main = page.getByRole("main");
    await expect(main.getByText(/Showing 1.*20 of 21/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Notifications, 3 unread", exact: true })).toBeVisible();
    await main.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(main.getByText("Notification message 20", { exact: true })).toBeVisible();
    await main.getByRole("button", { name: /^Unread/ }).click();
    await expect(main.getByText("Notification message 0", { exact: true })).toBeVisible();
    await expect(main.getByText("Notification message 20", { exact: true })).toHaveCount(0);
    expect(requested.map((url) => [url.searchParams.get("page"), url.searchParams.get("unread")])).toEqual([["1", null], ["2", null], ["1", "1"]]);
    expect(requested.every((url) => url.searchParams.get("pageSize") === "20")).toBe(true);
    expect(countRequests).toBe(0);
  });

  test("preview reopening reuses its pending request and ignores an older initial count", async ({ page }) => {
    let countRequests = 0;
    let previews = 0;
    let releaseCount!: () => void;
    let releasePreview!: () => void;
    const countGate = new Promise<void>((resolve) => { releaseCount = resolve; });
    const previewGate = new Promise<void>((resolve) => { releasePreview = resolve; });
    await page.route("**/api/notifications**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/unread-count")) {
        countRequests++;
        await countGate;
        return route.fulfill({ json: { success: true, data: { count: 8 } } });
      }
      previews++;
      expect(url.searchParams.get("view")).toBe("preview");
      expect(url.searchParams.get("pageSize")).toBe("10");
      await previewGate;
      return route.fulfill({ json: { success: true, data: { items: [notice(1), notice(2)], unreadCount: 3 } } });
    });
    await page.goto("/admin");
    await expect.poll(() => countRequests).toBe(1);
    await page.getByRole("button", { name: "Notifications", exact: true }).click();
    await expect.poll(() => previews).toBe(1);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Notifications", exact: true }).click();
    releasePreview();
    await expect(page.getByText("Notification message 1", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Notifications, 3 unread", exact: true })).toBeVisible();
    const olderResponse = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/unread-count"));
    releaseCount();
    await (await olderResponse).finished();
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "Appointments", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Appointments", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Notifications, 3 unread", exact: true })).toBeVisible();
    expect(countRequests).toBe(1);
    expect(previews).toBe(1);
  });

  test("marking one notification read updates the shared badge after navigation without recounting", async ({ page }) => {
    let counts = 0;
    let previews = 0;
    let writes = 0;
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    await page.route("**/api/notifications**", async route => {
      const url = new URL(route.request().url());
      if (route.request().method() === "PATCH") {
        writes++;
        expect(url.pathname).toBe("/api/notifications/notice-1/read");
        await writeGate;
        return route.fulfill({ json: { success: true, data: { id: "notice-1", isRead: true } } });
      }
      if (url.pathname.endsWith("/unread-count")) {
        counts++;
        return route.fulfill({ json: { success: true, data: { count: 3 } } });
      }
      previews++;
      return route.fulfill({ json: { success: true, data: { items: [notice(1), notice(2, true)], unreadCount: 3 } } });
    });
    await page.goto("/admin");
    await page.getByRole("button", { name: "Notifications, 3 unread", exact: true }).click();
    await page.getByText("Notification message 1", { exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/appointments$/);
    await expect(page.getByRole("button", { name: "Notifications, 2 unread", exact: true })).toBeVisible();
    const response = page.waitForResponse((item) => new URL(item.url()).pathname.endsWith("/notice-1/read"));
    releaseWrite();
    await (await response).finished();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("button", { name: "Notifications, 2 unread", exact: true })).toBeVisible();
    expect(writes).toBe(1);
    expect(counts).toBe(1);
    expect(previews).toBe(1);
  });

  test("mark-all failure rolls back history and badge before a successful retry without extra reads", async ({ page }) => {
    let counts = 0;
    let histories = 0;
    let previews = 0;
    let writes = 0;
    let releaseFailure!: () => void;
    const failureGate = new Promise<void>((resolve) => { releaseFailure = resolve; });
    await page.route("**/api/notifications**", async route => {
      const url = new URL(route.request().url());
      if (route.request().method() === "PATCH") {
        writes++;
        expect(url.pathname).toBe("/api/notifications/read-all");
        if (writes === 1) {
          await failureGate;
          return route.fulfill({ status: 503, json: { success: false, message: "Could not mark notifications read." } });
        }
        return route.fulfill({ json: { success: true, data: { updated: 2 } } });
      }
      if (url.pathname.endsWith("/unread-count")) {
        counts++;
        return route.fulfill({ json: { success: true, data: { count: 2 } } });
      }
      if (url.searchParams.get("view") === "preview") {
        previews++;
        return route.fulfill({ json: { success: true, data: { items: [notice(1, true), notice(2, true)], unreadCount: 0 } } });
      }
      histories++;
      return route.fulfill({ json: history([notice(1), notice(2)], 2) });
    });
    await page.goto("/admin/notifications");
    const main = page.getByRole("main");
    const action = main.getByRole("button", { name: "Mark all as read", exact: true });
    await expect(page.getByRole("button", { name: "Notifications, 2 unread", exact: true })).toBeVisible();
    await expect(main.getByText("New", { exact: true })).toHaveCount(2);
    await action.click();
    await expect(page.getByRole("button", { name: "Notifications, no unread", exact: true })).toBeVisible();
    await expect(main.getByText("New", { exact: true })).toHaveCount(0);
    releaseFailure();
    await expect(page.getByText("Could not mark notifications read.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Notifications, 2 unread", exact: true })).toBeVisible();
    await expect(main.getByText("New", { exact: true })).toHaveCount(2);
    await expect(action).toBeEnabled();
    await action.click();
    await expect(page.getByRole("button", { name: "Notifications, no unread", exact: true })).toBeVisible();
    await expect(action).toBeDisabled();
    await expect(main.getByText("New", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Notifications, no unread", exact: true }).click();
    await expect(page.getByText("Notification message 1", { exact: true })).toHaveCount(2);
    expect(writes).toBe(2);
    expect(counts).toBe(0);
    expect(histories).toBe(1);
    expect(previews).toBe(1);
  });

  test("preview retry retains the badge and mark-all works for unread notifications outside the preview", async ({ page }) => {
    let counts = 0;
    let previews = 0;
    let writes = 0;
    await page.route("**/api/notifications**", route => {
      const url = new URL(route.request().url());
      if (route.request().method() === "PATCH") {
        writes++;
        return route.fulfill({ json: { success: true, data: { updated: 5 } } });
      }
      if (url.pathname.endsWith("/unread-count")) {
        counts++;
        return route.fulfill({ json: { success: true, data: { count: 5 } } });
      }
      previews++;
      return previews === 1
        ? route.fulfill({ status: 503, json: { success: false, message: "Preview temporarily unavailable." } })
        : route.fulfill({ json: { success: true, data: { items: Array.from({ length: 10 }, (_, index) => notice(index, true)), unreadCount: 5 } } });
    });
    await page.goto("/admin");
    await page.getByRole("button", { name: "Notifications, 5 unread", exact: true }).click();
    await expect(page.getByText("Preview temporarily unavailable.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Notifications, 5 unread", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByText("Notification message 9", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Unread", { exact: true })).toHaveCount(0);
    const markAll = page.getByRole("button", { name: "Mark all as read", exact: true });
    await expect(markAll).toBeEnabled();
    await markAll.click();
    await expect(page.getByRole("button", { name: "Notifications, no unread", exact: true })).toBeVisible();
    expect(counts).toBe(1);
    expect(previews).toBe(2);
    expect(writes).toBe(1);
  });
});
