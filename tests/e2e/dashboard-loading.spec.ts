import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { clinicDateKey, dateKeyToUtc } from "../../src/lib/clinic-time";

test.describe("deferred dashboard charts", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires an isolated PostgreSQL TEST_DATABASE_URL.");
  let prisma: PrismaClient;
  let staffId: string;
  let dentistId: string;
  let serviceId: string;
  let patientId: string;
  let appointmentId: string;

  test.beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    expect(url.pathname.endsWith("_test")).toBe(true);
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    const email = `${randomUUID()}@example.test`;
    staffId = (await prisma.user.create({ data: { name: "Chart Test", email, passwordHash: "not-a-login", role: "DENTIST" } })).id;
    dentistId = (await prisma.dentist.create({ data: { name: "Chart Test", email, specialization: "General" } })).id;
    serviceId = (await prisma.service.create({ data: { name: "Chart Test", durationMin: 30, price: 500 } })).id;
    patientId = (await prisma.patient.create({ data: { firstName: "Chart", lastName: "Test", phone: "09123456789" } })).id;
    appointmentId = (await prisma.appointment.create({ data: {
      referenceNumber: `APT-${randomUUID()}`, dentistId, serviceId, patientId,
      appointmentDate: dateKeyToUtc(clinicDateKey()), startTime: "09:00", endTime: "09:30", status: "COMPLETED",
    } })).id;
  });

  test.afterAll(async () => {
    if (!prisma) return;
    if (appointmentId) await prisma.appointment.delete({ where: { id: appointmentId } });
    if (patientId) await prisma.patient.delete({ where: { id: patientId } });
    if (serviceId) await prisma.service.delete({ where: { id: serviceId } });
    if (dentistId) await prisma.dentist.delete({ where: { id: dentistId } });
    if (staffId) await prisma.user.delete({ where: { id: staffId } });
    await prisma.$disconnect();
  });

  for (const [width, theme] of [[1440, "light"], [390, "dark"]] as const) {
    test(`charts wait for visibility and keep layout stable: ${width}px ${theme}`, async ({ context, page, baseURL }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript((mode) => {
        localStorage.setItem("aether-theme", mode);
        const Observer = window.IntersectionObserver;
        window.IntersectionObserver = class extends Observer {
          constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
            super(callback, options);
            if (options?.rootMargin === "200px") {
              this.observe = (element: Element) => {
                (window as Window & { releaseAnalytics?: () => void }).releaseAnalytics = () => callback([{ isIntersecting: true, target: element } as IntersectionObserverEntry], this);
              };
            }
          }
        };
      }, theme);
      const name = "authjs.session-token";
      const value = await encode({ token: { id: staffId, role: "DENTIST" }, secret: process.env.NEXTAUTH_SECRET || "isolated-browser-regression-secret", salt: name });
      await context.addCookies([{ name, value, url: baseURL || "http://127.0.0.1:3100", httpOnly: true, sameSite: "Lax" }]);
      await page.route("**/api/notifications**", route => route.fulfill({ json: { success: true, data: { count: 0 } } }));
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto("/admin");
      await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
      await expect(page.getByLabel("View Today's Appointments")).toBeVisible();
      await expect.poll(() => page.evaluate(() => typeof (window as Window & { releaseAnalytics?: () => void }).releaseAnalytics)).toBe("function");
      const loading = page.getByRole("status", { name: "Loading analytics", exact: true });
      await expect(loading).toBeVisible();
      const before = await loading.boundingBox();
      await page.evaluate(() => (window as Window & { releaseAnalytics?: () => void }).releaseAnalytics?.());
      const chart = page.getByRole("region", { name: "Analytics", exact: true });
      await expect(chart.getByRole("button", { name: /Completed/ })).toBeVisible();
      await expect(chart.locator("svg.recharts-surface").first()).toBeVisible();
      const after = await chart.boundingBox();
      expect(Math.abs(before!.height - after!.height)).toBeLessThanOrEqual(2);
      expect(errors).toEqual([]);
      await chart.screenshot({ path: `node_modules/.cache/aether-performance/chart-${width}-${theme}.png` });
    });
  }
});
