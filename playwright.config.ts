import { defineConfig } from "@playwright/test";

// Pin the worker secret before Prisma can load a different value from .env.
process.env.NEXTAUTH_SECRET ||= "isolated-browser-regression-secret";
process.env.AUTH_SECRET = process.env.NEXTAUTH_SECRET;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://aether.localhost:3100", browserName: "chromium", trace: "retain-on-failure", launchOptions: { args: ["--host-resolver-rules=MAP *.localhost 127.0.0.1"] } },
  webServer: {
    command: "node node_modules/next/dist/bin/next start -p 3100",
    url: "http://127.0.0.1:3100/favicon.ico",
    reuseExistingServer: false,
    env: {
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "isolated-browser-regression-secret",
      AUTH_SECRET: process.env.NEXTAUTH_SECRET || "isolated-browser-regression-secret",
      DEMO_MODE: "false",
      TENANT_BASE_DOMAIN: "localhost",
      TRUST_PROXY_HOST: "false",
      SMTP_HOST: "",
      EMAIL_PREVIEW_MODE: "false",
      DATABASE_URL: process.env.TEST_DATABASE_URL || "postgresql://unconfigured@127.0.0.1:1/aether_unconfigured_test",
      DIRECT_URL: process.env.TEST_DATABASE_URL || "postgresql://unconfigured@127.0.0.1:1/aether_unconfigured_test",
    },
  },
});
