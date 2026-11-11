import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { mockModuleExports } from "../helpers/mock-module";

test("subscription page guards administrators and explains trial, paid and expired access", async t => {
  let session: null | { user: { role: string } } = null;
  let tenant = {
    id: "clinic", slug: "clinic", name: "Example Clinic", active: true,
    subscriptionMode: "TRIAL", subscriptionEndsAt: new Date("2099-01-05T12:00:00Z"),
  };
  let tenantReads = 0;
  mockModuleExports(t, require.resolve("../../src/lib/server-session"), { getServerSession: async () => session });
  mockModuleExports(t, require.resolve("../../src/lib/tenant"), { getRequestTenant: async () => { tenantReads++; return tenant; } });
  mockModuleExports(t, require.resolve("next/navigation"), { redirect: (url: string) => { throw new Error(`redirect:${url}`); } });
  const { default: SubscriptionPage } = await import("../../src/app/admin/subscription/page");
  await assert.rejects(SubscriptionPage(), /redirect:\/login/);
  for (const role of ["RECEPTIONIST", "ASSISTANT", "DENTIST"]) {
    session = { user: { role } };
    await assert.rejects(SubscriptionPage(), /redirect:\/admin$/);
  }
  assert.equal(tenantReads, 0, "Unauthorized roles must not load subscription details");
  session = { user: { role: "ADMIN" } };
  let html = renderToStaticMarkup(await SubscriptionPage());
  assert.match(html, /Example Clinic/);
  assert.match(html, /Trial active/);
  assert.match(html, /30 days/);
  assert.match(html, /8:00.*PM/);
  assert.match(html, /Philippine time/);
  tenant = { ...tenant, subscriptionMode: "PAID" };
  html = renderToStaticMarkup(await SubscriptionPage());
  assert.match(html, />Active</);
  assert.doesNotMatch(html, /Trial active/);
  tenant = { ...tenant, subscriptionEndsAt: new Date("2000-01-05T12:00:00Z") };
  html = renderToStaticMarkup(await SubscriptionPage());
  assert.match(html, />Expired</);
  assert.match(html, /Your clinic is read-only/);
  assert.match(html, /existing records remain available/);
  assert.match(html, /Contact your service provider/);
  assert.doesNotMatch(html, /<form|<button|Checkout|invoice|card number/i);
});
