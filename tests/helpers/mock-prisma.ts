import { mock, type TestContext } from "node:test";

// Prisma delegates are proxies whose method descriptors are not visible to mock.method.
export function mockPrismaMethod<T, K extends keyof T>(t: TestContext, target: T, key: K, implementation: (...args: never[]) => unknown) {
  const original = target[key];
  const replacement = mock.fn(implementation);
  target[key] = replacement as T[K];
  t.after(() => { target[key] = original; });
  return replacement;
}
