import assert from "node:assert/strict";
import test from "node:test";
import { mockModuleExports } from "../helpers/mock-module";

test("real configuration authorization allows demo reads and rejects all demo mutations", async (t) => {
  mockModuleExports(t, require.resolve("../../src/auth"), {
    auth: async () => ({ user: { id: "demo", name: "Demo", role: "ADMIN", isDemo: true } }),
  });
  mockModuleExports(t, require.resolve("../../src/lib/clinic-configuration"), {
    getClinicConfiguration: async () => ({ address: null }),
    listClinicClosures: async () => [],
    updateClinicConfiguration: () => { throw new Error("demo must not write"); },
    createClinicClosure: () => { throw new Error("demo must not write"); },
    removeClinicClosure: () => { throw new Error("demo must not write"); },
  });
  const config = await import("../../src/app/api/admin/configuration/route");
  const closures = await import("../../src/app/api/admin/clinic-closures/route");
  const closure = await import("../../src/app/api/admin/clinic-closures/[id]/route");
  assert.equal((await config.GET()).status, 200);
  assert.equal((await closures.GET()).status, 200);
  const request = new Request("http://localhost", { method: "PATCH", body: "{}" });
  assert.equal((await config.PATCH(request)).status, 403);
  assert.equal((await closures.POST(request)).status, 403);
  assert.equal((await closure.DELETE(request, { params: Promise.resolve({ id: "closure" }) })).status, 403);
});
