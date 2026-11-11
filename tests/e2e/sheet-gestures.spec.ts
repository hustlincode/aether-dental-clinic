import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

type Details = "patient" | "dentist" | "calendar";
const patient = {
  id: "gesture-patient", firstName: "Gesture", lastName: "Patient", email: null, phone: "09123456789",
  notes: "Synthetic gesture note. ".repeat(180), status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", _count: { appointments: 30 }, appointments: [],
};
const dentist = {
  id: "gesture-dentist", name: "Dr. Gesture Test", email: "gesture@example.test", phone: "09123456789",
  specialization: "General Dentistry", profileImage: null, status: "ACTIVE",
  availability: [{ dayOfWeek: "MONDAY", startTime: "09:00", endTime: "17:00", breakStart: null, breakEnd: null, isWorking: true }],
};
const appointment = {
  id: "gesture-appointment", referenceNumber: "APT-GESTURE", appointmentDate: "2027-01-05T00:00:00Z",
  startTime: "09:00", endTime: "09:30", status: "PENDING", notes: "Synthetic gesture note. ".repeat(180),
  patient, dentist, service: { name: "Cleaning" },
};

async function drag(page: Page, target: Locator, dx: number, dy: number, duration: number, finish: "touchEnd" | "touchCancel" | null = "touchEnd") {
  const box = (await target.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  const steps = duration < 40 ? 2 : 8;
  for (let step = 1; step <= steps; step++) {
    // Gesture timing distinguishes slow distance drags from quick velocity swipes.
    await page.waitForTimeout(duration / steps);
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx * step / steps, y: y + dy * step / steps, id: 1 }] });
  }
  if (finish) {
    await client.send("Input.dispatchTouchEvent", { type: finish, touchPoints: [] });
    await client.detach();
  }
  return client;
}

async function openDetails(page: Page, kind: Details) {
  if (kind !== "calendar") {
    await page.goto(`/admin/${kind}s`);
  } else {
    await page.goto("/admin/calendar");
    await page.getByRole("button", { name: /, 1 appointments$/ }).click({ position: { x: 8, y: 8 } });
  }
  const trigger = kind !== "calendar"
    ? page.getByTitle(`View ${kind} details`, { exact: true })
    : page.getByRole("button", { name: /Gesture Patient.*Cleaning/ });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: kind === "calendar" ? "Appointment Details" : kind === "patient" ? "Patient Details" : "Dentist Details", exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('[data-slot="sheet-body"]').getByText(kind === "dentist" ? dentist.name : "Gesture Patient", { exact: true })).toBeVisible();
  await drawer.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))));
  return { drawer, trigger };
}

async function atRest(drawer: Locator, y: number) {
  await expect.poll(async () => Math.abs((await drawer.boundingBox())!.y - y)).toBeLessThanOrEqual(1);
}

test.describe("mobile details gestures", () => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires an isolated PostgreSQL TEST_DATABASE_URL.");
  let prisma: PrismaClient;
  let staffId: string;

  test.beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    expect(url.pathname.endsWith("_test")).toBe(true);
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    staffId = (await prisma.user.create({ data: { tenantId: "aether", name: "Gesture QA", email: `${randomUUID()}@example.test`, role: "ADMIN", passwordHash: "not-a-login" } })).id;
  });

  test.afterAll(async () => {
    if (!prisma) return;
    if (staffId) await prisma.user.delete({ where: { id: staffId } });
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ context, page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await page.clock.setFixedTime(new Date("2027-01-01T00:00:00Z"));
    const name = "authjs.session-token";
    const value = await encode({ token: { tenantId: "aether", id: staffId, role: "ADMIN", sessionVersion: 0 }, secret: process.env.NEXTAUTH_SECRET || "isolated-browser-regression-secret", salt: name });
    await context.addCookies([{ name, value, url: baseURL!, httpOnly: true, sameSite: "Lax" }]);
    await page.route("**/api/notifications**", route => route.fulfill({ json: { success: true, data: { items: [], unreadCount: 0, count: 0 } } }));
    await page.route("**/api/patients?**", route => route.fulfill({ json: { success: true, data: {
      patients: [patient], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    } } }));
    await page.route("**/api/patients/gesture-patient", route => route.fulfill({ json: { success: true, data: {
      patient, stats: { total: 30, completed: 30, cancelled: 0, nextAppointment: null, lastAppointment: appointment },
      history: Array.from({ length: 30 }, (_, index) => ({ ...appointment, id: `history-${index}`, status: "COMPLETED" })),
    } } }));
    await page.route("**/api/dentists?**", route => route.fulfill({ json: { success: true, data: [dentist] } }));
    await page.route("**/api/dentists/gesture-dentist", route => route.fulfill({ json: { success: true, data: {
      dentist, stats: { totalAppointments: 46, upcomingCount: 30 },
      upcoming: Array.from({ length: 30 }, (_, index) => ({ ...appointment, id: `upcoming-${index}` })),
    } } }));
    await page.route("**/api/appointments?**", route => route.fulfill({ json: { success: true, data: {
      items: [appointment], pagination: { page: 1, pageSize: 200, total: 1, totalPages: 1 },
    } } }));
  });

  for (const kind of ["patient", "dentist", "calendar"] as const) {
    test(`${kind}: short and cancelled drags return; horizontal and upward gestures do not dismiss`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const { drawer } = await openDetails(page, kind);
      const handle = drawer.locator('[data-slot="sheet-handle"]');
      const header = drawer.locator('[data-slot="sheet-header"]').getByRole("heading").first();
      const y = (await drawer.boundingBox())!.y;
      await drag(page, handle, 0, 18, 240);
      await atRest(drawer, y);
      await drag(page, handle, 0, 70, 240, "touchCancel");
      await atRest(drawer, y);
      await drag(page, header, 110, 15, 240);
      await atRest(drawer, y);
      await drag(page, handle, 0, -45, 240);
      await atRest(drawer, y);
      await expect(drawer).toBeVisible();
    });

    test(`${kind}: a downward drag and a quick swipe dismiss and restore focus`, async ({ page }) => {
      const { drawer, trigger } = await openDetails(page, kind);
      await drag(page, drawer.locator('[data-slot="sheet-handle"]'), 0, 150, 480);
      await expect(drawer).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(drawer).toBeVisible();
      // Stay below the distance threshold while allowing for native touch-frame delivery.
      expect(Math.min(120, (await drawer.boundingBox())!.height * 0.25)).toBeGreaterThan(80);
      await drag(page, drawer.locator('[data-slot="sheet-header"]').getByRole("heading").first(), 0, 80, 16);
      await expect(drawer).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });

    test(`${kind}: the body scrolls without moving the sheet and Close still works`, async ({ page }, testInfo) => {
      const { drawer, trigger } = await openDetails(page, kind);
      const body = drawer.locator('[data-slot="sheet-body"]');
      const y = (await drawer.boundingBox())!.y;
      const mainTop = await page.locator("main").evaluate(element => element.scrollTop);
      await drawer.screenshot({ path: testInfo.outputPath(`${kind}-mobile.png`) });
      await drag(page, body, 0, -160, 300);
      await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      await atRest(drawer, y);
      expect(await page.locator("main").evaluate(element => element.scrollTop)).toBe(mainTop);
      const close = kind !== "calendar" ? drawer.getByRole("button", { name: `Close ${kind} details`, exact: true }) : drawer.locator('button[aria-label="Close"]');
      await close.click();
      await expect(drawer).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });

    test(`${kind}: desktop does not drag and resizing cancels an active mobile gesture`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1440, height: 844 });
      const { drawer, trigger } = await openDetails(page, kind);
      const title = drawer.locator('[data-slot="sheet-header"]').getByRole("heading").first();
      if (kind === "dentist") {
        const appointments = drawer.locator('[data-slot="dentist-appointments"]');
        expect(await appointments.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
        await appointments.evaluate(element => { element.scrollLeft = element.scrollWidth; });
        expect(await appointments.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
      }
      await drawer.screenshot({ path: testInfo.outputPath(`${kind}-desktop.png`) });
      const desktop = await drawer.boundingBox();
      await drag(page, title, 0, 150, 300);
      expect(await drawer.boundingBox()).toEqual(desktop);
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await page.setViewportSize({ width: 390, height: 844 });
      await trigger.click();
      const y = (await drawer.boundingBox())!.y;
      const client = await drag(page, drawer.locator('[data-slot="sheet-handle"]'), 0, 70, 300, null);
      expect((await drawer.boundingBox())!.y).toBeGreaterThan(y + 40);
      await page.setViewportSize({ width: 1440, height: 844 });
      await atRest(drawer, 0);
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await client.detach();
      await expect(drawer).toBeVisible();
      expect((await drawer.boundingBox())!.height).toBe(844);
    });
  }

  test("a calendar update completing after swipe dismissal cannot close the newly opened drawer", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/appointments/*/status", async route => {
      await gate;
      await route.fulfill({ json: { success: true } });
    });
    const { drawer, trigger } = await openDetails(page, "calendar");
    try {
      const requested = page.waitForRequest(request => request.url().endsWith("/status") && request.method() === "PATCH");
      await drawer.getByRole("button", { name: "Confirm", exact: true }).click();
      await requested;
      await drag(page, drawer.locator('[data-slot="sheet-handle"]'), 0, 150, 480);
      await expect(drawer).toHaveCount(0);
      await trigger.click();
      release();
      await expect(page.getByText("Appointment marked as Confirmed.", { exact: true })).toBeVisible();
      await expect(drawer).toBeVisible();
    } finally { release(); }
  });
});
