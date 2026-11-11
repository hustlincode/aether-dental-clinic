import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

test.describe("admin page scroll ownership", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires an isolated PostgreSQL TEST_DATABASE_URL.");
  let prisma: PrismaClient;
  let staffId: string;
  let dentistId: string;

  test.beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    expect(url.pathname.endsWith("_test")).toBe(true);
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    const marker = randomUUID();
    staffId = (await prisma.user.create({ data: { tenantId: "aether", name: "Scroll test", email: `${marker}@example.test`, passwordHash: "not-a-login", role: "ADMIN" } })).id;
    dentistId = (await prisma.dentist.create({ data: { tenantId: "aether", name: "Dr Scroll Test", email: `${marker}-dentist@example.test`, specialization: "General" } })).id;
  });

  test.afterAll(async () => {
    if (!prisma) return;
    if (dentistId) await prisma.dentist.delete({ where: { id: dentistId } });
    if (staffId) {
      await prisma.notification.deleteMany({ where: { userId: staffId } });
      await prisma.user.delete({ where: { id: staffId } });
    }
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ context, page, baseURL }) => {
    const name = "authjs.session-token";
    const value = await encode({ token: { tenantId: "aether", id: staffId, role: "ADMIN", sessionVersion: 0 }, secret: process.env.NEXTAUTH_SECRET || "isolated-browser-regression-secret", salt: name });
    await context.addCookies([{ name, value, url: baseURL!, httpOnly: true, sameSite: "Lax" }]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/notifications**", route => route.fulfill({ json: { success: true, data: { items: [], unreadCount: 0, count: 0, page: 1, pageSize: 20, total: 0, totalPages: 0 } } }));
    await page.route("**/api/dentists?**", route => route.fulfill({ json: { success: true, data: [] } }));
    await page.route("**/api/services?**", route => route.fulfill({ json: { success: true, data: [] } }));
    await page.route("**/api/patients?**", route => route.fulfill({ json: { success: true, data: { patients: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } } }));
    await page.route("**/api/admin/users?**", route => route.fulfill({ json: { success: true, data: { users: [], total: 0 } } }));
    await page.route("**/api/admin/configuration", route => route.fulfill({ json: { success: true, data: { address: null, phone: null, email: null, openingTime: "09:00", closingTime: "17:00", lunchBreakStart: null, lunchBreakEnd: null, updatedAt: "2027-01-01T00:00:00Z" } } }));
    await page.route("**/api/admin/clinic-closures", route => route.fulfill({ json: { success: true, data: [] } }));
    await page.route("**/api/dentists/*/availability", route => route.fulfill({ json: { success: true, data: [] } }));
    await page.route("**/api/appointments?**", route => route.fulfill({ json: { success: true, data: { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } } }));
  });

  for (const width of [1440, 390]) {
    test(`admin routes keep vertical scrolling inside main: ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 500 });
      for (const path of ["", "/appointments", "/calendar", "/patients", "/dentists", "/services", "/users", "/configuration", "/reports", "/notifications", `/dentists/${dentistId}`]) {
        await page.goto(`/admin${path}`);
        const main = page.getByRole("main");
        await expect(main.getByRole("heading").first()).toBeVisible();
        const box = (await main.boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(501);
        const documentSize = await page.evaluate(() => ({
          height: document.documentElement.scrollHeight,
          viewport: window.innerHeight,
          beyondViewport: Array.from(document.body.querySelectorAll<HTMLElement>("*")).filter(element => {
            const style = getComputedStyle(element);
            return style.position === "absolute" && element.getBoundingClientRect().bottom > window.innerHeight + 1;
          }).slice(0, 12).map(element => ({ tag: element.tagName, slot: element.dataset.slot, className: element.className, bottom: element.getBoundingClientRect().bottom, parent: element.parentElement?.className })),
        }));
        expect(documentSize.height, JSON.stringify({ path, ...documentSize })).toBeLessThanOrEqual(documentSize.viewport + 1);
        expect(await main.evaluate(element => getComputedStyle(element).overflowY)).toBe("auto");
        const nested = await main.evaluate(element => Array.from(element.querySelectorAll<HTMLElement>("*")).filter(node => node.clientHeight > 0 && /^(auto|scroll)$/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1).map(node => `${node.tagName}.${node.className}`));
        expect(nested, path || "dashboard").toEqual([]);
      }
      if (width < 768) await page.getByRole("button", { name: "Toggle navigation menu", exact: true }).click();
      const navigation = width < 768 ? page.getByRole("dialog", { name: "Clinic navigation" }).locator("nav") : page.locator("aside nav");
      expect(await navigation.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
      await navigation.evaluate(element => { element.scrollTop = element.scrollHeight; });
      expect(await navigation.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      if (width < 768) {
        await page.keyboard.press("Escape");
        await expect(page.getByRole("button", { name: "Toggle navigation menu", exact: true })).toBeFocused();
      }
    });

    test(`appointment rows use page scrolling and keep pagination reachable: ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 500 });
      let requestedPage = 1;
      await page.route("**/api/appointments?**", route => {
        requestedPage = Number(new URL(route.request().url()).searchParams.get("page"));
        const items = Array.from({ length: 20 }, (_, index) => ({ id: `scroll-${index}`, referenceNumber: `APT-scroll-${index}`, appointmentDate: "2027-01-05T00:00:00Z", startTime: "09:00", endTime: "09:30", status: "COMPLETED", dentistId, serviceId: "service", patient: { firstName: `Patient ${index}`, lastName: "Scroll Test", phone: "09123456789", email: null }, dentist: { id: dentistId, name: "Dr Scroll Test" }, service: { id: "service", name: "Cleaning" } }));
        return route.fulfill({ json: { success: true, data: { items, pagination: { page: requestedPage, pageSize: 20, total: 40, totalPages: 2 } } } });
      });
      await page.goto("/admin/appointments");
      await expect(page.getByText("APT-scroll-19", { exact: true })).toBeAttached();
      const main = page.getByRole("main");
      const table = main.locator("table");
      const scrollOwner = await table.evaluate(element => {
        const owners = [];
        for (let node = element.parentElement; node; node = node.parentElement) {
          if (/^(auto|scroll)$/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1) owners.push(node.tagName);
        }
        return owners;
      });
      expect(scrollOwner).toEqual(["MAIN"]);
      const horizontal = table.locator("xpath=../../..");
      expect(await horizontal.evaluate(element => getComputedStyle(element).overflowX)).toBe("auto");
      if (width < 640) {
        expect(await horizontal.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
        await horizontal.evaluate(element => { element.scrollLeft = element.scrollWidth; });
        expect(await horizontal.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
      }
      await main.evaluate(element => { element.scrollTop = element.scrollHeight; });
      expect(await main.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      await expect(page.getByRole("button", { name: "Next page", exact: true })).toBeInViewport();
      await page.getByRole("button", { name: "Next page", exact: true }).click();
      await expect.poll(() => requestedPage).toBe(2);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
    });
  }
});
