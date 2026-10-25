import { defineConfig } from "@playwright/test";

process.env.NEXTAUTH_SECRET ||= "isolated-browser-regression-secret";
process.env.AUTH_SECRET = process.env.NEXTAUTH_SECRET;
process.env.E2E_DEMO_ENABLED = "true";

// Keep demo-enabled authentication checks separate from the normal demo-disabled suite.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "auth-navigation.spec.ts",
  workers: 1,
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3110", browserName: "chromium", trace: "retain-on-failure" },
  webServer: {
    command: "node node_modules/next/dist/bin/next start -p 3110",
    url: "http://127.0.0.1:3110/login",
    reuseExistingServer: false,
    env: {
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
      AUTH_SECRET: process.env.AUTH_SECRET,
      DEMO_MODE: "true",
      DEMO_EMAIL: "notification-demo@example.test",
      SMTP_HOST: "",
      EMAIL_PREVIEW_MODE: "false",
      DATABASE_URL: process.env.TEST_DATABASE_URL || "postgresql://unconfigured@127.0.0.1:1/aether_unconfigured_test",
      DIRECT_URL: process.env.TEST_DATABASE_URL || "postgresql://unconfigured@127.0.0.1:1/aether_unconfigured_test",
    },
  },
});
