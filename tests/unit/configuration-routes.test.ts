import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { mockModuleExports } from "../helpers/mock-module";
import { ConfigurationError } from "../../src/lib/clinic-configuration";

test("configuration routes apply ADMIN read/write guards before work and invalidate only after successful writes", async (t) => {
  let denied: number | null = 403;
  const readGuard = mock.fn(async (...roles: string[]) => {
    assert.deepEqual(roles, ["ADMIN"]);
    return { user: { id: "admin" }, error: denied ? Response.json({}, { status: denied }) : null };
  });
  const writeGuard = mock.fn(async (...roles: string[]) => {
    assert.deepEqual(roles, ["ADMIN"]);
    return { user: { id: "admin" }, error: denied ? Response.json({}, { status: denied }) : null };
  });
  mockModuleExports(t, require.resolve("../../src/lib/api"), { requireRole: readGuard, requireWriteRole: writeGuard });
  let conflict = false;
  const getConfig = mock.fn(async () => ({ phone: "123" }));
  const update = mock.fn(async () => {
    if (conflict) throw new ConfigurationError("Resolve appointments.", 409, { appointmentCount: 1 });
    return { phone: "123" };
  });
  const create = mock.fn(async () => ({ id: "closure" }));
  const remove = mock.fn(async () => ({ deleted: true }));
  mockModuleExports(t, require.resolve("../../src/lib/clinic-configuration"), {
    getClinicConfiguration: getConfig, updateClinicConfiguration: update,
    listClinicClosures: async () => [], createClinicClosure: create, removeClinicClosure: remove,
  });
  const cache = mock.fn();
  const homeCache = mock.fn();
  mockModuleExports(t, require.resolve("../../src/lib/home-cache"), { revalidateClinicPages: cache, revalidateHomepage: homeCache });
  const config = await import("../../src/app/api/admin/configuration/route");
  const closures = await import("../../src/app/api/admin/clinic-closures/route");
  const closure = await import("../../src/app/api/admin/clinic-closures/[id]/route");
  const request = () => new Request("http://localhost/api/admin/configuration", { method: "PATCH", body: "{}" });
  const context = { params: Promise.resolve({ id: "closure" }) };
  for (const status of [401, 403]) {
    denied = status;
    assert.equal((await config.GET()).status, status);
    assert.equal((await config.PATCH(request())).status, status);
    assert.equal((await closures.GET()).status, status);
    assert.equal((await closures.POST(request())).status, status);
    assert.equal((await closure.DELETE(request(), context)).status, status);
  }
  assert.equal(getConfig.mock.callCount(), 0);
  assert.equal(update.mock.callCount(), 0);
  assert.equal(create.mock.callCount(), 0);
  assert.equal(remove.mock.callCount(), 0);
  denied = null;
  assert.equal((await config.GET()).status, 200);
  assert.equal((await config.PATCH(request())).status, 200);
  assert.equal(cache.mock.callCount(), 1);
  conflict = true;
  const response = await config.PATCH(request());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).details.appointmentCount, 1);
  assert.equal(cache.mock.callCount(), 1);
  assert.equal((await config.PATCH(new Request("http://localhost", { method: "PATCH", body: "{" }))).status, 400);
  assert.equal((await closures.POST(request())).status, 201);
  assert.equal((await closure.DELETE(request(), context)).status, 200);
  assert.equal(homeCache.mock.callCount(), 2);
});
