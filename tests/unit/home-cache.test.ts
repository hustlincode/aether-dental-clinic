import assert from "node:assert/strict";
import test from "node:test";
import { mockModuleExports } from "../helpers/mock-module";

test("clinic saves invalidate both public pages even when one invalidation fails", async (t) => {
  const paths: string[] = [];
  let failPath = "";
  mockModuleExports(t, require.resolve("next/cache"), {
    revalidatePath: (path: string) => {
      paths.push(path);
      if (path === failPath) throw new Error("cache unavailable");
    },
  });
  t.mock.method(console, "error", () => undefined);
  const { revalidateClinicPages } = await import("../../src/lib/home-cache");
  for (failPath of ["", "/", "/privacy-policy"]) {
    paths.length = 0;
    assert.doesNotThrow(revalidateClinicPages);
    assert.deepEqual(paths, ["/", "/privacy-policy"]);
  }
});
