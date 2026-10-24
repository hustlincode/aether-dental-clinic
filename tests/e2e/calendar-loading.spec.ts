import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

function appointment(index: number, month = "01", day = "05") {
  return {
    id: `appointment-${month}-${index}`,
    referenceNumber: `APT-${month}-${index}`,
    appointmentDate: `2027-${month}-${day}T00:00:00.000Z`,
    startTime: "09:00",
    endTime: "09:30",
    status: "PENDING",
    notes: null,
    patient: { firstName: `Patient${index}`, lastName: "Test", phone: "09123456789" },
    dentist: { name: "Dr Test" },
    service: { name: "Cleaning" },
  };
}

function calendarPage(items: ReturnType<typeof appointment>[], page: number, total: number) {
  return { success: true, data: { items, pagination: { page, pageSize: 200, total, totalPages: Math.ceil(total / 200) } } };
}

test.describe("calendar loading", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires an isolated PostgreSQL TEST_DATABASE_URL.");
  let prisma: PrismaClient;
  let staffId: string;

  test.beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    expect(url.pathname.endsWith("_test")).toBe(true);
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    staffId = (await prisma.user.create({ data: { name: "Calendar browser test", email: `${randomUUID()}@example.test`, passwordHash: "not-a-login", role: "ADMIN" } })).id;
  });

  test.afterAll(async () => {
    if (!prisma) return;
    if (staffId) await prisma.user.delete({ where: { id: staffId } });
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ context, page, baseURL }) => {
    const name = "authjs.session-token";
    const value = await encode({ token: { id: staffId, role: "ADMIN" }, secret: process.env.NEXTAUTH_SECRET || "isolated-browser-regression-secret", salt: name });
    await context.addCookies([{ name, value, url: baseURL || "http://127.0.0.1:3100", httpOnly: true, sameSite: "Lax" }]);
    await page.clock.setFixedTime(new Date("2027-01-01T00:00:00Z"));
    await page.route("**/api/notifications**", route => route.fulfill({ json: { success: true, data: { items: [], unreadCount: 0, count: 0 } } }));
  });

  test("loads every bounded page beyond 500 appointments and exposes partial progress", async ({ page }) => {
    const events = Array.from({ length: 501 }, (_, index) => appointment(index, "01", index === 500 ? "20" : "05"));
    const requested: URL[] = [];
    let releaseSecondPage!: () => void;
    const secondPageGate = new Promise<void>(resolve => { releaseSecondPage = resolve; });
    await page.route("**/api/appointments?**", async route => {
      const url = new URL(route.request().url());
      requested.push(url);
      const number = Number(url.searchParams.get("page"));
      if (number === 2) await secondPageGate;
      await route.fulfill({ json: calendarPage(events.slice((number - 1) * 200, number * 200), number, events.length) });
    });
    await page.goto("/admin/calendar");
    await expect(page.getByRole("status").filter({ hasText: "Loaded 200 of 501 appointments. Loading more..." })).toBeVisible();
    await expect(page.locator("[aria-busy=true]")).toBeVisible();
    releaseSecondPage();
    await expect(page.getByRole("status").filter({ hasText: /^501 appointments loaded\.$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tuesday, January 5, 2027, 500 appointments", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Wednesday, January 20, 2027, 1 appointments", exact: true })).toBeVisible();
    expect(requested.map(url => url.searchParams.get("page"))).toEqual(["1", "2", "3"]);
    for (const url of requested) {
      expect(url.searchParams.get("view")).toBe("calendar");
      expect(url.searchParams.get("pageSize")).toBe("200");
      expect(url.searchParams.get("from")).toBe("2027-01-01");
      expect(url.searchParams.get("to")).toBe("2027-01-31");
    }
  });

  test("a later-page failure reports an incomplete month and retry reloads all pages", async ({ page }) => {
    const events = Array.from({ length: 201 }, (_, index) => appointment(index));
    let failSecondPage = true;
    const pages: number[] = [];
    await page.route("**/api/appointments?**", route => {
      const number = Number(new URL(route.request().url()).searchParams.get("page"));
      pages.push(number);
      return number === 2 && failSecondPage
        ? route.fulfill({ status: 503, json: { success: false, message: "Schedule temporarily unavailable" } })
        : route.fulfill({ json: calendarPage(events.slice((number - 1) * 200, number * 200), number, events.length) });
    });
    await page.goto("/admin/calendar");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Calendar incomplete");
    await expect(page.getByRole("status").filter({ hasText: "200 appointments loaded. Calendar is incomplete." })).toBeVisible();
    await expect(page.locator("[aria-busy=false]")).toBeVisible();
    failSecondPage = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /^201 appointments loaded\.$/ })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    expect(pages).toEqual([1, 2, 1, 2]);
  });

  test("changing month cancels stale pages without replacing the new month", async ({ page }) => {
    let releaseJanuary!: () => void;
    const januaryGate = new Promise<void>(resolve => { releaseJanuary = resolve; });
    await page.route("**/api/appointments?**", async route => {
      const url = new URL(route.request().url());
      const january = url.searchParams.get("from") === "2027-01-01";
      if (january) await januaryGate;
      await route.fulfill({ json: calendarPage([appointment(january ? 1 : 2, january ? "01" : "02")], 1, 1) });
    });
    const januaryRequest = page.waitForRequest(request => new URL(request.url()).searchParams.get("from") === "2027-01-01");
    await page.goto("/admin/calendar");
    await januaryRequest;
    const aborted = page.waitForEvent("requestfailed", request => new URL(request.url()).searchParams.get("from") === "2027-01-01");
    await page.getByRole("button", { name: "Next month", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /^1 appointments loaded\.$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Friday, February 5, 2027, 1 appointments", exact: true })).toContainText("Patient2");
    releaseJanuary();
    await aborted;
    await expect(page.getByRole("button", { name: "Friday, February 5, 2027, 1 appointments", exact: true })).toContainText("Patient2");
    await expect(page.getByText("Patient1 Test", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  });

  test("saving a status closes the sheet while the calendar refresh continues", async ({ page }) => {
    const events = Array.from({ length: 201 }, (_, index) => appointment(index));
    let refreshing = false;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>(resolve => { releaseRefresh = resolve; });
    await page.route("**/api/appointments?**", async route => {
      const number = Number(new URL(route.request().url()).searchParams.get("page"));
      if (!refreshing) return route.fulfill({ json: calendarPage([appointment(1)], 1, 1) });
      if (number === 2) await refreshGate;
      await route.fulfill({ json: calendarPage(events.slice((number - 1) * 200, number * 200), number, events.length) });
    });
    await page.route("**/api/appointments/*/status", route => {
      refreshing = true;
      return route.fulfill({ json: { success: true } });
    });
    await page.goto("/admin/calendar");
    await page.getByText("Patient1 Test", { exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Appointment Details" });
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Loaded 200 of 201 appointments. Loading more..." })).toBeVisible();
    releaseRefresh();
    await expect(page.getByRole("status").filter({ hasText: /^201 appointments loaded\.$/ })).toBeVisible();
  });

  test("a status response does not restart the month the user has left", async ({ page }) => {
    const requestedMonths: string[] = [];
    await page.route("**/api/appointments?**", route => {
      const from = new URL(route.request().url()).searchParams.get("from")!;
      requestedMonths.push(from);
      return route.fulfill({ json: calendarPage([appointment(from.startsWith("2027-01") ? 1 : 2, from.startsWith("2027-01") ? "01" : "02")], 1, 1) });
    });
    let releaseStatus!: () => void;
    const statusGate = new Promise<void>(resolve => { releaseStatus = resolve; });
    await page.route("**/api/appointments/*/status", async route => {
      await statusGate;
      await route.fulfill({ json: { success: true } });
    });
    await page.goto("/admin/calendar");
    await page.getByText("Patient1 Test", { exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Appointment Details" });
    const statusRequest = page.waitForRequest(request => request.url().endsWith("/status") && request.method() === "PATCH");
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await statusRequest;
    await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
    await page.getByRole("button", { name: "Next month", exact: true }).click();
    await expect(page.getByRole("button", { name: "Friday, February 5, 2027, 1 appointments", exact: true })).toContainText("Patient2");
    releaseStatus();
    await expect(page.getByText("Appointment marked as Confirmed.", { exact: true })).toBeVisible();
    expect(requestedMonths).toEqual(["2027-01-01", "2027-02-01"]);
    await expect(page.getByRole("button", { name: "Friday, February 5, 2027, 1 appointments", exact: true })).toContainText("Patient2");
  });
});
