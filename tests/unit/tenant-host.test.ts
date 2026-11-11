import assert from "node:assert/strict";
import test from "node:test";
import { assertTenantAuthEnvironment, tenantSlugFromHeaders } from "../../src/lib/tenant-host";

const production: NodeJS.ProcessEnv = { NODE_ENV: "production", TENANT_BASE_DOMAIN: "clinics.example.test" };
const slug = (host: string, env = production, forwarded?: string) => tenantSlugFromHeaders(
  new Headers({ host, ...(forwarded ? { "x-forwarded-host": forwarded } : {}) }), env,
);

test("fixed Auth.js origins are rejected without exposing configured values", () => {
  assert.doesNotThrow(() => assertTenantAuthEnvironment({ NODE_ENV: "production" }));
  for (const name of ["AUTH_URL", "NEXTAUTH_URL"]) {
    assert.throws(() => assertTenantAuthEnvironment({ NODE_ENV: "production", [name]: "https://private.example.test" }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Remove AUTH_URL and NEXTAUTH_URL/);
      assert.doesNotMatch(error.message, /private\.example/);
      return true;
    });
  }
});

test("only one valid clinic label under the configured platform suffix resolves", () => {
  assert.equal(slug("north.clinics.example.test"), "north");
  assert.equal(slug("North.CLINICS.EXAMPLE.TEST:443"), "north");
  for (const host of ["clinics.example.test", "north.clinics.example.test.evil.test", "north.evil.test", "a.b.clinics.example.test", "-north.clinics.example.test", "north-.clinics.example.test", "north.clinics.example.test.", "north.clinics.example.test:99999", "north.clinics.example.test:0", "north.clinics.example.test,evil.test", "north.clinics.example.test@evil.test"]) {
    assert.equal(slug(host), null, host);
  }
  assert.equal(slug(`${"a".repeat(64)}.clinics.example.test`), null);
});

test("forwarded host is ignored unless a trusted proxy is explicitly configured", () => {
  assert.equal(slug("north.clinics.example.test", production, "south.clinics.example.test"), "north");
  assert.equal(slug("internal.test", { ...production, TRUST_PROXY_HOST: "true" }, "south.clinics.example.test"), "south");
  assert.equal(slug("north.clinics.example.test", { ...production, TRUST_PROXY_HOST: "true" }, "north.clinics.example.test,evil.test"), null);
});

test("production has no implicit domain or localhost fallback", () => {
  assert.equal(slug("north.localhost", { NODE_ENV: "production" }), null);
  assert.equal(slug("localhost", production), null);
  assert.equal(slug("localhost:3000", { NODE_ENV: "development" }), "aether");
  assert.equal(slug("127.0.0.1:3000", { NODE_ENV: "test" }), "aether");
  assert.equal(slug("south.localhost:3000", { NODE_ENV: "development" }), "south");
  assert.equal(slug("localhost:3000", { NODE_ENV: "development", TENANT_BASE_DOMAIN: "clinics.example.test" }), null);
});
