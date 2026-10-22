import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import "dotenv/config";

const target = process.env.TEST_DATABASE_URL;
if (!target) {
  console.log("SKIPPED database integration: TEST_DATABASE_URL is not set.");
  process.exit(0);
}
const url = new URL(target);
assert(["postgres:", "postgresql:"].includes(url.protocol), "Test database must use PostgreSQL.");
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Disposable test database must run on loopback.");
assert(url.pathname.endsWith("_test"), "Disposable database name must end with _test.");
for (const configured of [process.env.DATABASE_URL, process.env.DIRECT_URL].filter(Boolean)) {
  const application = new URL(configured);
  const sameHost = application.hostname === url.hostname || ["localhost", "127.0.0.1", "[::1]"].includes(application.hostname);
  assert(!(sameHost && (application.port || "5432") === (url.port || "5432") && application.pathname === url.pathname), "Refusing to use the configured application database.");
}
const env = { ...process.env, DATABASE_URL: target, DIRECT_URL: target, TEST_DATABASE_URL: target, RUN_DATABASE_TESTS: "1", SMTP_HOST: "", EMAIL_PREVIEW_MODE: "false", NEXTAUTH_SECRET: "isolated-integration-secret", AUTH_SECRET: "isolated-integration-secret", DEMO_MODE: "false" };
for (const args of [
  ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"],
  ["--import", "tsx", "--test", "tests/integration/booking.test.ts"],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
