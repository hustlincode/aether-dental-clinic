import { test, expect, type Page } from "@playwright/test";

async function expectDarkUtility(page: Page, dark: boolean) {
  await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.id = "theme-utility-probe";
    probe.className = "bg-transparent dark:bg-surface-alt";
    probe.setAttribute("aria-hidden", "true");
    probe.style.setProperty("--surface-alt", "#000000");
    document.body.append(probe);
  });
  const probe = page.locator("#theme-utility-probe");
  if (dark) {
    await expect(probe).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  } else {
    await expect(probe).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  }
}

for (const mode of ["light", "dark"] as const) {
  const system = mode === "light" ? "dark" : "light";
  const label = mode === "light" ? "Light" : "Dark";

  test(`manual ${mode} overrides the opposite system theme and persists after reload`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: system });
    await page.goto("/login");
    await page.getByRole("button", { name: `Change theme (current: System, ${system})`, exact: true }).click();
    await page.getByRole("menuitemradio", { name: label, exact: true }).click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
    await expect(page.locator("html")).toHaveCSS("color-scheme", mode);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("aether-theme"))).toBe(mode);
    await expectDarkUtility(page, mode === "dark");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
    await expect(page.getByRole("button", { name: `Change theme (current: ${label})`, exact: true })).toBeVisible();
    await expectDarkUtility(page, mode === "dark");
    await page.getByRole("button", { name: `Change theme (current: ${label})`, exact: true }).click();
    await expect(page.getByRole("menuitemradio", { name: label, exact: true })).toHaveAttribute("aria-checked", "true");
  });
}

test("reduced-motion theme changes skip view transitions", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/login");
  const trigger = page.getByRole("button", { name: "Change theme (current: System, light)", exact: true });
  await expect(trigger).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: () => { throw new Error("View transitions must be skipped under reduced motion"); },
    });
  });
  await trigger.click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("aether-theme"))).toBe("dark");
});
