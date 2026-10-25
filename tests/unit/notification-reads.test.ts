import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/db";
import { getNotificationPreview, getNotifications } from "../../src/lib/notifications";
import { mockPrismaMethod } from "../helpers/mock-prisma";
import { mockModuleExports } from "../helpers/mock-module";

const item = {
  id: "notice", type: "APPOINTMENT_CREATED", title: "Appointment request",
  message: "Synthetic test notification", entityType: "appointment", entityId: "appointment",
  isRead: false, readAt: null, createdAt: new Date("2026-10-25T00:00:00Z"),
};

test("preview starts only its two reads together with a bounded user-scoped projection", async (t) => {
  let releaseItems!: (value: typeof item[]) => void;
  let releaseCount!: (value: number) => void;
  const items = mockPrismaMethod(t, prisma.notification, "findMany", () => new Promise<typeof item[]>(resolve => { releaseItems = resolve; }));
  const count = mockPrismaMethod(t, prisma.notification, "count", () => new Promise<number>(resolve => { releaseCount = resolve; }));
  const result = getNotificationPreview("owner", 10);
  assert.equal(items.mock.callCount(), 1);
  assert.equal(count.mock.callCount(), 1, "Preview must not query a pagination total");
  const query = items.mock.calls[0].arguments[0] as Prisma.NotificationFindManyArgs;
  assert.deepEqual(query.where, { userId: "owner" });
  assert.equal(query.take, 10);
  assert.equal(query.skip, undefined);
  assert.deepEqual(query.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.deepEqual(query.select, {
    id: true, type: true, title: true, message: true,
    entityType: true, entityId: true, isRead: true, readAt: true, createdAt: true,
  });
  assert.deepEqual(count.mock.calls[0].arguments[0], { where: { userId: "owner", isRead: false } });
  releaseItems([item]);
  releaseCount(17);
  assert.deepEqual(await result, { items: [item], unreadCount: 17 });
});

test("unread history reuses its unread count while retaining the pagination contract", async (t) => {
  const items = mockPrismaMethod(t, prisma.notification, "findMany", async () => [item]);
  const count = mockPrismaMethod(t, prisma.notification, "count", async () => 47);
  const result = await getNotifications("owner", { page: 3, pageSize: 20, unreadOnly: true });
  assert.equal(count.mock.callCount(), 1);
  assert.deepEqual(count.mock.calls[0].arguments[0], { where: { userId: "owner", isRead: false } });
  const query = items.mock.calls[0].arguments[0] as Prisma.NotificationFindManyArgs;
  assert.deepEqual(query.where, { userId: "owner", isRead: false });
  assert.equal(query.skip, 40);
  assert.equal(query.take, 20);
  assert.deepEqual(result, { items: [item], total: 47, unreadCount: 47, page: 3, pageSize: 20, totalPages: 3 });
});

test("all history preserves full rows and independently counts its total and unread rows", async (t) => {
  const row = { ...item, userId: "owner" };
  const items = mockPrismaMethod(t, prisma.notification, "findMany", async () => [row]);
  const count = mockPrismaMethod(t, prisma.notification, "count", async (query: Prisma.NotificationCountArgs) => query.where?.isRead === false ? 2 : 23);
  const result = await getNotifications("owner", { page: 2, pageSize: 10 });
  assert.equal(count.mock.callCount(), 2);
  assert.deepEqual(count.mock.calls.map(call => call.arguments[0]), [{ where: { userId: "owner", isRead: false } }, { where: { userId: "owner" } }]);
  const query = items.mock.calls[0].arguments[0] as Prisma.NotificationFindManyArgs;
  assert.deepEqual(query.where, { userId: "owner" });
  assert.equal(query.select, undefined, "Existing full-row consumers must remain compatible");
  assert.equal(query.skip, 10);
  assert.deepEqual(result, { items: [row], total: 23, unreadCount: 2, page: 2, pageSize: 10, totalPages: 3 });
});

test("notification routes preserve auth, bounds, private responses and separate timing stages", async (t) => {
  let userId: string | null = "owner-a";
  let authCalls = 0;
  let authFailure = false;
  let dataFailure = false;
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
  mockModuleExports(t, require.resolve("../../src/lib/api"), {
    requireAuth: async () => {
      authCalls++;
      if (authFailure) throw new Error("Sensitive authentication detail");
      return userId
        ? { user: { id: userId }, error: null }
        : { user: null, error: Response.json({ success: false, message: "Authentication required." }, { status: 401 }) };
    },
  });
  const items = mockPrismaMethod(t, prisma.notification, "findMany", async () => {
    if (dataFailure) throw new Error("Sensitive notification payload");
    return [item];
  });
  const count = mockPrismaMethod(t, prisma.notification, "count", async () => {
    if (dataFailure) throw new Error("Sensitive notification payload");
    return 4;
  });
  const listRoute = await import("../../src/app/api/notifications/route");
  const countRoute = await import("../../src/app/api/notifications/unread-count/route");
  const list = (query = "") => listRoute.GET(new Request(`http://localhost/api/notifications?${query}`));
  function headers(response: Response, noData = false) {
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.match(response.headers.get("Server-Timing") ?? "", /^auth;dur=\d+\.\d, data;dur=\d+\.\d$/);
    if (noData) assert.match(response.headers.get("Server-Timing")!, /data;dur=0\.0$/);
  }

  await t.test("preview returns only items and unread count with a ten-item maximum", async () => {
    for (const [query, size] of [["view=preview", 10], ["view=preview&pageSize=999", 10], ["view=preview&pageSize=2", 2], ["view=preview&pageSize=0", 10], ["view=preview&pageSize=1.5", 10], ["view=preview&pageSize=invalid", 10]] as const) {
      const previousCounts = count.mock.callCount();
      const response = await list(query);
      headers(response);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { success: true, data: { items: [{ ...item, createdAt: item.createdAt.toISOString() }], unreadCount: 4 } });
      const args = items.mock.calls.at(-1)!.arguments[0] as Prisma.NotificationFindManyArgs;
      assert.equal(args.take, size);
      assert.equal(count.mock.callCount() - previousCounts, 1);
    }
  });

  await t.test("legacy pagination remains flat with the existing fifty-item cap", async () => {
    const response = await list("page=2&pageSize=999");
    headers(response);
    const body = await response.json();
    assert.deepEqual(Object.keys(body.data).sort(), ["items", "page", "pageSize", "total", "totalPages", "unreadCount"].sort());
    assert.equal(body.data.page, 2);
    assert.equal(body.data.pageSize, 50);
    const query = items.mock.calls.at(-1)!.arguments[0] as Prisma.NotificationFindManyArgs;
    assert.equal(query.skip, 50);
    assert.equal(query.take, 50);
    const previousCounts = count.mock.callCount();
    const unread = await list("unread=true&page=invalid");
    assert.equal((await unread.json()).data.page, 1);
    assert.equal(count.mock.callCount() - previousCounts, 1);
  });

  await t.test("count responses preserve their envelope and fresh auth for each caller", async () => {
    const before = authCalls;
    const response = await countRoute.GET();
    headers(response);
    assert.deepEqual(await response.json(), { success: true, data: { count: 4 } });
    userId = "owner-b";
    await list("view=preview");
    assert.equal(authCalls - before, 2);
    assert.deepEqual(count.mock.calls.at(-1)!.arguments[0], { where: { userId: "owner-b", isRead: false } });
    assert.deepEqual((items.mock.calls.at(-1)!.arguments[0] as Prisma.NotificationFindManyArgs).where, { userId: "owner-b" });
  });

  await t.test("unauthorized requests return private timed 401s without data reads", async () => {
    userId = null;
    const before = { items: items.mock.callCount(), count: count.mock.callCount() };
    for (const response of [await list("view=preview"), await countRoute.GET()]) {
      assert.equal(response.status, 401);
      headers(response, true);
      assert.deepEqual(await response.json(), { success: false, message: "Authentication required." });
    }
    assert.equal(items.mock.callCount(), before.items);
    assert.equal(count.mock.callCount(), before.count);
  });

  await t.test("database and auth failures retain safe private timed responses", async () => {
    userId = "owner-a";
    dataFailure = true;
    for (const response of [await list("view=preview"), await countRoute.GET()]) {
      assert.equal(response.status, 500);
      headers(response);
      assert.equal((await response.json()).success, false);
    }
    dataFailure = false;
    authFailure = true;
    const before = count.mock.callCount();
    for (const response of [await list(), await countRoute.GET()]) {
      assert.equal(response.status, 500);
      headers(response, true);
    }
    assert.equal(count.mock.callCount(), before);
    assert(!JSON.stringify(logs).includes("Sensitive"), "Logs must not include error payloads or authentication details");
  });
});
