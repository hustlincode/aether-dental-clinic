import { test, expect, type Page } from "@playwright/test";

async function bookingOptions(page: Page) {
  await page.clock.setFixedTime(new Date("2027-01-01T00:00:00Z"));
  await page.route("**/api/services", route => route.fulfill({ json: { success: true, data: [{ id: "service", name: "Test Cleaning", durationMin: 30, price: 500, status: "ACTIVE" }] } }));
  await page.route("**/api/dentists", route => route.fulfill({ json: { success: true, data: [{ id: "dentist", name: "Dr Test", specialization: "General", status: "ACTIVE", profileImage: null }] } }));
}

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

test("login inputs have accessible names and production has no passwordless demo", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /demo/i })).toHaveCount(0);
});
