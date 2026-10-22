import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://127.0.0.1:3100", browserName: "chromium", trace: "retain-on-failure" },
  webServer: {
    command: "node node_modules/next/dist/bin/next start -p 3100",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    env: {
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "isolated-browser-regression-secret",
      AUTH_SECRET: process.env.NEXTAUTH_SECRET || "isolated-browser-regression-secret",
      DEMO_MODE: "false",
      SMTP_HOST: "",
      EMAIL_PREVIEW_MODE: "false",
      DATABASE_URL: process.env.TEST_DATABASE_URL || "postgresql://unconfigured@127.0.0.1:1/aether_unconfigured_test",
      DIRECT_URL: process.env.TEST_DATABASE_URL || "postgresql://unconfigured@127.0.0.1:1/aether_unconfigured_test",
    },
  },
});
