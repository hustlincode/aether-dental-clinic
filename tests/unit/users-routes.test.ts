import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { Prisma } from "@prisma/client";
import { mockModuleExports } from "../helpers/mock-module";
import { createUserSchema, UserManagementError } from "../../src/lib/user-management";

test("Users routes enforce real Admin/demo guards before work and preserve response conventions", async t => {
  let session: null | { user: { id: string; role: string; isDemo?: boolean } } = null;
  mockModuleExports(t, require.resolve("../../src/auth"), { auth: async () => session });
  const list = mock.fn(async () => ({ users: [], total: 0 }));
  const options = mock.fn(async () => []);
  let failure: unknown;
  const create = mock.fn(async (input: unknown) => { if (failure) throw failure; createUserSchema.parse(input); return { id: "staff" }; });
  const update = mock.fn(async () => { if (failure) throw failure; return { id: "staff" }; });
  const reset = mock.fn(async () => ({ id: "staff", reset: true }));
  mockModuleExports(t, require.resolve("../../src/lib/user-management"), {
    listUsers: list, listDentistOptions: options, createUser: create, updateUser: update, resetUserPassword: reset,
  });
  const users = await import("../../src/app/api/admin/users/route");
  const user = await import("../../src/app/api/admin/users/[id]/route");
  const password = await import("../../src/app/api/admin/users/[id]/password/route");
  const dentists = await import("../../src/app/api/admin/users/dentist-options/route");
  const context = { params: Promise.resolve({ id: "staff" }) };
  const request = (method = "POST", body: unknown = {}) => new Request("http://localhost/api/admin/users", { method, body: JSON.stringify(body) });
  for (const role of [null, "RECEPTIONIST", "ASSISTANT", "DENTIST"]) {
    session = role ? { user: { id: "staff", role } } : null;
    const status = role ? 403 : 401;
    assert.equal((await users.GET(new Request("http://localhost/api/admin/users"))).status, status);
    assert.equal((await dentists.GET(new Request("http://localhost/api/admin/users/dentist-options"))).status, status);
    assert.equal((await users.POST(request())).status, status);
    assert.equal((await user.PATCH(request("PATCH"), context)).status, status);
    assert.equal((await password.POST(request(), context)).status, status);
  }
  assert.equal(list.mock.callCount(), 0);
  assert.equal(create.mock.callCount(), 0);
  assert.equal(update.mock.callCount(), 0);
  assert.equal(reset.mock.callCount(), 0);
  session = { user: { id: "demo", role: "ADMIN", isDemo: true } };
  assert.equal((await users.GET(new Request("http://localhost/api/admin/users"))).status, 200);
  assert.equal((await users.POST(request())).status, 403);
  assert.equal((await user.PATCH(request("PATCH"), context)).status, 403);
  assert.equal((await password.POST(request(), context)).status, 403);
  assert.equal(create.mock.callCount(), 0);
  session = { user: { id: "admin", role: "ADMIN" } };
  const created = await users.POST(request("POST", { name: "Test Staff", email: "staff@example.test", role: "ASSISTANT", password: "long-staff-password" }));
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { success: true, data: { id: "staff" } });
  const invalid = await users.POST(request("POST", { name: "Test", email: "staff@example.test", role: "ADMIN", password: "short" }));
  assert.equal(invalid.status, 422);
  assert((await invalid.json()).details.password.length > 0);
  assert.equal((await users.POST(new Request("http://localhost", { method: "POST", body: "{" }))).status, 400);
  failure = new UserManagementError("Protected", 403);
  assert.equal((await user.PATCH(request("PATCH"), context)).status, 403);
  failure = new UserManagementError("Missing", 404);
  assert.equal((await user.PATCH(request("PATCH"), context)).status, 404);
  failure = new Prisma.PrismaClientKnownRequestError("Duplicate", { code: "P2002", clientVersion: "test" });
  assert.equal((await users.POST(request())).status, 409);
});
