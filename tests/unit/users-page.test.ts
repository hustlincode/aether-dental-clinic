import assert from "node:assert/strict";
import test from "node:test";
import { mockModuleExports } from "../helpers/mock-module";

test("the Users server page redirects guests and non-admins and preserves demo read-only mode", async t => {
  let session: null | { user: { role: string; isDemo?: boolean } } = null;
  mockModuleExports(t, require.resolve("../../src/lib/server-session"), { getServerSession: async () => session });
  mockModuleExports(t, require.resolve("next/navigation"), { redirect: (url: string) => { throw new Error(`redirect:${url}`); } });
  mockModuleExports(t, require.resolve("../../src/components/admin/users-manager"), { UsersManager: () => null });
  const { default: UsersPage } = await import("../../src/app/admin/users/page");
  await assert.rejects(UsersPage(), /redirect:\/login/);
  for (const role of ["RECEPTIONIST", "ASSISTANT", "DENTIST"]) {
    session = { user: { role } };
    await assert.rejects(UsersPage(), /redirect:\/admin$/);
  }
  session = { user: { role: "ADMIN" } };
  assert.equal((await UsersPage()).props.isDemo, false);
  session = { user: { role: "ADMIN", isDemo: true } };
  assert.equal((await UsersPage()).props.isDemo, true);
});
