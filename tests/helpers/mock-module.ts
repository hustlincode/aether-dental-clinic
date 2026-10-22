import type { TestContext } from "node:test";

export function mockModuleExports(t: TestContext, path: string, overrides: Record<string, unknown>) {
  // tsx emits these modules as CommonJS; swap cached exports before loading the route.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const original = require(path);
  const cached = require.cache[path]!;
  cached.exports = { ...original, ...overrides };
  t.after(() => { cached.exports = original; });
}
