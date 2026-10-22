import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("integration runner skips without an explicit test URL and refuses application or remote targets", () => {
  const run = (env: Record<string, string>) => spawnSync(process.execPath, ["tests/run-integration.mjs"], { encoding: "utf8", env: { ...process.env, ...env } });
  const skipped = run({ TEST_DATABASE_URL: "" });
  assert.equal(skipped.status, 0);
  assert.match(skipped.stdout, /SKIPPED/);
  const sameDatabase = run({ TEST_DATABASE_URL: "postgresql://user@127.0.0.1:5432/app_test", DATABASE_URL: "postgresql://user@127.0.0.1:5432/app_test" });
  assert.notEqual(sameDatabase.status, 0);
  assert.match(sameDatabase.stderr, /Refusing to use the configured application database/);
  const sameDirectDatabase = run({ TEST_DATABASE_URL: "postgresql://user@127.0.0.1:5432/app_test", DATABASE_URL: "postgresql://user@127.0.0.1:5432/app", DIRECT_URL: "postgresql://user@127.0.0.1:5432/app_test" });
  assert.notEqual(sameDirectDatabase.status, 0);
  assert.match(sameDirectDatabase.stderr, /Refusing to use the configured application database/);
  const alias = run({ TEST_DATABASE_URL: "postgresql://user@127.0.0.1:5432/app_test", DATABASE_URL: "postgresql://user@localhost/app_test" });
  assert.notEqual(alias.status, 0);
  assert.match(alias.stderr, /Refusing to use the configured application database/);
  const remote = run({ TEST_DATABASE_URL: "postgresql://user@db.example.test/app_test" });
  assert.notEqual(remote.status, 0);
  assert.match(remote.stderr, /must run on loopback/);
  const productionName = run({ TEST_DATABASE_URL: "postgresql://user@127.0.0.1:5432/app" });
  assert.notEqual(productionName.status, 0);
  assert.match(productionName.stderr, /must end with _test/);
});
