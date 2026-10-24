import { test, expect, type Page } from "@playwright/test";

async function bookingOptions(page: Page) {
  await page.clock.setFixedTime(new Date("2027-01-01T00:00:00Z"));
  await page.route("**/api/services", route => route.fulfill({ json: { success: true, data: [{ id: "service", name: "Test Cleaning", durationMin: 30, price: 500, status: "ACTIVE" }] } }));
  await page.route("**/api/dentists?view=booking", route => route.fulfill({ json: { success: true, data: [{ id: "dentist", name: "Dr Test", specialization: "General", status: "ACTIVE", profileImage: null }] } }));
}

test("services remain usable while dentists load and only failed dentists retry", async ({ page }) => {
  await bookingOptions(page);
  let serviceCalls = 0;
  let dentistCalls = 0;
  let releaseDentists!: () => void;
  const dentistGate = new Promise<void>(resolve => { releaseDentists = resolve; });
  await page.route("**/api/services", route => {
    serviceCalls++;
    return route.fulfill({ json: { success: true, data: [{ id: "service", name: "Test Cleaning", durationMin: 30, price: 500, status: "ACTIVE" }] } });
  });
  await page.route("**/api/dentists?view=booking", async route => {
    dentistCalls++;
    if (dentistCalls === 1) {
      await dentistGate;
      await route.fulfill({ status: 503, json: { success: false } });
    } else {
      await route.fulfill({ json: { success: true, data: [{ id: "dentist", name: "Dr Test", specialization: "General", status: "ACTIVE" }] } });
    }
  });
  await page.route("**/api/availability/dates?**", route => route.fulfill({ json: { success: true, data: ["2027-01-05"] } }));
  await page.goto("/book");
  await page.getByRole("button", { name: /Test Cleaning/ }).click();
  await expect(page.getByRole("status")).toHaveText("Loading dentists...");
  releaseDentists();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Unable to load dentists");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const datesRequest = page.waitForRequest(request => request.url().includes("/api/availability/dates?"));
  await page.getByRole("button", { name: /Dr Test/ }).click();
  expect(new URL((await datesRequest).url()).searchParams.get("serviceId")).toBe("service");
  await expect(page.getByRole("button", { name: "5", exact: true })).toBeEnabled();
  expect(serviceCalls).toBe(1);
  expect(dentistCalls).toBe(2);
});

test("retrying failed services keeps the successful dentist request", async ({ page }) => {
  await bookingOptions(page);
  let serviceCalls = 0;
  let dentistCalls = 0;
  await page.route("**/api/services", route => {
    serviceCalls++;
    return serviceCalls === 1
      ? route.fulfill({ status: 503, json: { success: false } })
      : route.fulfill({ json: { success: true, data: [{ id: "service", name: "Test Cleaning", durationMin: 30, price: 500, status: "ACTIVE" }] } });
  });
  await page.route("**/api/dentists?view=booking", route => {
    dentistCalls++;
    return route.fulfill({ json: { success: true, data: [{ id: "dentist", name: "Dr Test", specialization: "General", status: "ACTIVE" }] } });
  });
  await page.goto("/book");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Unable to load services");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("button", { name: /Test Cleaning/ }).click();
  await expect(page.getByRole("button", { name: /Dr Test/ })).toBeVisible();
  expect(serviceCalls).toBe(2);
  expect(dentistCalls).toBe(1);
});

test("changing dentists cancels superseded available dates", async ({ page }) => {
  await bookingOptions(page);
  await page.route("**/api/dentists?view=booking", route => route.fulfill({ json: { success: true, data: [
    { id: "first", name: "Dr First", specialization: "General", status: "ACTIVE" },
    { id: "second", name: "Dr Second", specialization: "General", status: "ACTIVE" },
  ] } }));
  let releaseFirst!: () => void;
  const gate = new Promise<void>(resolve => { releaseFirst = resolve; });
  await page.route("**/api/availability/dates?**", async route => {
    const first = new URL(route.request().url()).searchParams.get("dentistId") === "first";
    if (first) await gate;
    await route.fulfill({ json: { success: true, data: [first ? "2027-01-05" : "2027-01-06"] } });
  });
  await page.goto("/book");
  await page.getByRole("button", { name: /Test Cleaning/ }).click();
  const firstRequest = page.waitForRequest(request => request.url().includes("/api/availability/dates?dentistId=first"));
  await page.getByRole("button", { name: /Dr First/ }).click();
  await firstRequest;
  const aborted = page.waitForEvent("requestfailed", request => request.url().includes("/api/availability/dates?dentistId=first"));
  await page.getByRole("button", { name: /Change dentist$/ }).click();
  await page.getByRole("button", { name: /Dr Second/ }).click();
  await expect(page.getByRole("button", { name: "6", exact: true })).toBeEnabled();
  releaseFirst();
  await aborted;
  await expect(page.getByRole("button", { name: "6", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "5", exact: true })).toBeDisabled();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("changing dates cancels superseded time slots", async ({ page }) => {
  await bookingOptions(page);
  await page.route("**/api/availability/dates?**", route => route.fulfill({ json: { success: true, data: ["2027-01-05", "2027-01-06"] } }));
  let releaseFirst!: () => void;
  const gate = new Promise<void>(resolve => { releaseFirst = resolve; });
  await page.route("**/api/availability/slots?**", async route => {
    const first = new URL(route.request().url()).searchParams.get("date") === "2027-01-05";
    if (first) await gate;
    await route.fulfill({ json: { success: true, data: [{ start: first ? "09:00" : "10:00", end: first ? "09:30" : "10:30" }] } });
  });
  await page.goto("/book");
  await page.getByRole("button", { name: /Test Cleaning/ }).click();
  await page.getByRole("button", { name: /Dr Test/ }).click();
  const firstRequest = page.waitForRequest(request => new URL(request.url()).searchParams.get("date") === "2027-01-05");
  await page.getByRole("button", { name: "5", exact: true }).click();
  await firstRequest;
  const aborted = page.waitForEvent("requestfailed", request => new URL(request.url()).searchParams.get("date") === "2027-01-05");
  await page.getByRole("button", { name: /Change date$/ }).click();
  await page.getByRole("button", { name: "6", exact: true }).click();
  await expect(page.getByRole("button", { name: "10:00 AM", exact: true })).toBeVisible();
  releaseFirst();
  await aborted;
  await expect(page.getByRole("button", { name: "10:00 AM", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "9:00 AM", exact: true })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("failed availability has a retry and successful retry restores date selection", async ({ page }) => {
  await bookingOptions(page);
  let attempts = 0;
  await page.route("**/api/availability/dates?**", route => {
    attempts++;
    return attempts === 1
      ? route.fulfill({ status: 503, json: { success: false, message: "Schedule temporarily unavailable" } })
      : route.fulfill({ json: { success: true, data: ["2027-01-05"] } });
  });
  await page.goto("/book");
  await page.getByRole("button", { name: /Test Cleaning/ }).click();
  await page.getByRole("button", { name: /Dr Test/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Unable to load available dates" })).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("button", { name: "5", exact: true })).toBeEnabled();
  expect(attempts).toBe(2);
});

test("booking labels, error focus and pending/email failure result reflect actual outcomes", async ({ page }) => {
  await bookingOptions(page);
  await page.route("**/api/availability/dates?**", route => route.fulfill({ json: { success: true, data: ["2027-01-05"] } }));
  await page.route("**/api/availability/slots?**", route => route.fulfill({ json: { success: true, data: [{ start: "09:00", end: "09:30" }] } }));
  await page.route("**/api/appointments", route => route.fulfill({ status: 201, json: { success: true, data: { referenceNumber: "APT-test", subject: { referenceNumber: "APT-test", patientName: "New Person", serviceName: "Test Cleaning", dentistName: "Dr Test", date: "January 5, 2027", time: "9:00 AM", status: "PENDING" }, email: { ok: false, status: "FAILED" } } } }));
  await page.goto("/book");
  await page.getByRole("button", { name: /Test Cleaning/ }).click();
  await page.getByRole("button", { name: /Dr Test/ }).click();
  await page.getByRole("button", { name: "5", exact: true }).click();
  await page.getByRole("button", { name: "9:00 AM", exact: true }).click();
  await page.getByLabel("First name", { exact: true }).fill("New");
  await page.getByLabel("Last name", { exact: true }).fill("Person");
  await page.getByLabel("Email", { exact: true }).fill("new@example.test");
  await page.getByLabel("Phone number", { exact: true }).fill("09123456789");
  await page.getByRole("button", { name: /Review.*privacy|Read.*consent|privacy.*consent/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").check();
  await dialog.getByLabel(/Electronic signature/).fill("New Person");
  await dialog.getByRole("button", { name: /accept|agree/i }).click();
  await page.getByLabel("Email", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "Continue to review" }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Email", { exact: true }).fill("new@example.test");
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "Appointment Request Received" })).toBeVisible();
  await expect(page.getByText("Pending confirmation", { exact: true })).toBeVisible();
  await expect(page.getByText(/request is saved, but an email could not be sent/)).toBeVisible();
  await expect(page.getByText("Your appointment is confirmed.", { exact: true })).toHaveCount(0);
});

test("login inputs have accessible names and demo is hidden when disabled", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /demo/i })).toHaveCount(0);
});
