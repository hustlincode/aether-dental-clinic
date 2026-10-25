import assert from "node:assert/strict";
import test from "node:test";
import { createNotificationStore, type NotificationItem } from "../../src/lib/client-notifications";

function item(id: string, isRead = false): NotificationItem {
  return {
    id, type: "APPOINTMENT_CREATED", title: `Notice ${id}`, message: "Synthetic notification",
    entityType: "appointment", entityId: id, isRead,
    readAt: isRead ? "2026-10-25T00:00:00.000Z" : null, createdAt: "2026-10-25T00:00:00.000Z",
  };
}

function transport() {
  const calls: {
    url: string;
    method: string;
    signal: AbortSignal | null;
    reply: (data: unknown, status?: number) => void;
    fail: (error: Error) => void;
  }[] = [];
  const fetcher: typeof fetch = (input, init) => new Promise<Response>((resolve, reject) => {
    calls.push({
      url: input instanceof Request ? input.url : String(input),
      method: init?.method || "GET",
      signal: init?.signal || null,
      reply: (data, status = 200) => resolve(Response.json({ success: status < 400, data, ...(status >= 400 ? { message: "Request failed" } : {}) }, { status })),
      fail: reject,
    });
  });
  return { calls, fetcher };
}

async function seed(store: ReturnType<typeof createNotificationStore>, network: ReturnType<typeof transport>, items: NotificationItem[], count: number) {
  const pending = store.loadPreview();
  network.calls.at(-1)!.reply({ items, unreadCount: count });
  await pending;
}

test("badge initialization is single-flight and never requires a timer or repeat initialization", async () => {
  const network = transport();
  const store = createNotificationStore(false, network.fetcher);
  assert.equal(store.getSnapshot().count, null);
  const first = store.initialize();
  const second = store.initialize();
  assert.equal(network.calls.length, 1);
  assert.equal(network.calls[0].url, "/api/notifications/unread-count");
  network.calls[0].reply({ count: 4 });
  await Promise.all([first, second]);
  await store.initialize();
  assert.equal(network.calls.length, 1);
  assert.equal(store.getSnapshot().count, 4);
  store.dispose();
});

test("preview is single-flight and a later opening explicitly refreshes cached items", async () => {
  const network = transport();
  const store = createNotificationStore(false, network.fetcher);
  const first = store.loadPreview();
  const duplicate = store.loadPreview();
  assert.equal(first, duplicate);
  assert.equal(network.calls.length, 1);
  assert.equal(network.calls[0].url, "/api/notifications?view=preview&pageSize=10");
  assert.equal(store.getSnapshot().previewLoading, true);
  network.calls[0].reply({ items: [item("a")], unreadCount: 12 });
  await first;
  const refresh = store.loadPreview();
  assert.equal(network.calls.length, 2);
  assert.equal(store.getSnapshot().preview?.[0].id, "a", "Keep the previous successful list during refresh");
  network.calls[1].reply({ items: [item("b")], unreadCount: 13 });
  await refresh;
  assert.equal(store.getSnapshot().preview?.[0].id, "b");
  assert.equal(store.getSnapshot().count, 13);
  store.dispose();
});

test("a delayed bootstrap cannot replace the newer preview count", async () => {
  const network = transport();
  const store = createNotificationStore(false, network.fetcher);
  const bootstrap = store.initialize();
  const preview = store.loadPreview();
  network.calls[1].reply({ items: [item("a")], unreadCount: 8 });
  await preview;
  network.calls[0].reply({ count: 20 });
  await bootstrap;
  assert.equal(store.getSnapshot().count, 8);
  assert.equal(network.calls.length, 2);
  store.dispose();
});

test("history initializes the shared count without a separate unread request", async () => {
  const network = transport();
  const store = createNotificationStore(false, network.fetcher);
  const history = store.loadHistory(2, true, new AbortController().signal);
  assert.equal(network.calls[0].url, "/api/notifications?page=2&pageSize=20&unread=1");
  network.calls[0].reply({ items: [item("a")], unreadCount: 25, page: 2, pageSize: 20, total: 25, totalPages: 2 });
  const page = await history;
  assert.equal(page.page, 2);
  assert.equal(store.getSnapshot().count, 25);
  await store.initialize();
  assert.equal(network.calls.length, 1);
  store.dispose();
});

test("a delayed read cannot undo a successful optimistic mark-read", async () => {
  const network = transport();
  const store = createNotificationStore(false, network.fetcher);
  const notice = item("a");
  await seed(store, network, [notice], 4);
  const stalePreview = store.loadPreview();
  const mutation = store.markRead(notice);
  assert.equal(store.getSnapshot().count, 3);
  assert.equal(store.projectItems([notice])[0].isRead, true);
  network.calls[2].reply({ id: "a", isRead: true });
  await mutation;
  network.calls[1].reply({ items: [notice], unreadCount: 4 });
  await stalePreview;
  assert.equal(store.getSnapshot().count, 3);
  assert.equal(store.projectItems(store.getSnapshot().preview!)[0].isRead, true);
  assert.deepEqual(network.calls.map(call => call.method), ["GET", "GET", "PATCH"]);
  store.dispose();
});

test("failed PATCH responses roll back count and read flags without another GET", async () => {
  const network = transport();
  const store = createNotificationStore(false, network.fetcher);
  const notice = item("a");
  await seed(store, network, [notice], 4);
  const mutation = store.markRead(notice);
  assert.equal(store.getSnapshot().count, 3);
  network.calls[1].reply(null, 503);
  await mutation;
  assert.equal(store.getSnapshot().count, 4);
  assert.equal(store.projectItems([notice])[0].isRead, false);
  assert.equal(store.getSnapshot().pending, false);
  assert.equal(store.getSnapshot().mutationError, "Request failed");
  assert.deepEqual(network.calls.map(call => call.method), ["GET", "PATCH"]);
  store.dispose();
});

test("mark-all covers unread notifications outside the preview and avoids duplicate writes", async () => {
  const network = transport();
  const store = createNotificationStore(false, network.fetcher);
  const notices = [item("a"), item("b"), item("already-read", true)];
  await seed(store, network, notices, 35);
  const mutation = store.markAllRead();
  const repeat = store.markAllRead();
  const coveredRead = store.markRead(notices[0]);
  assert.equal(mutation, repeat);
  assert.equal(store.getSnapshot().count, 0);
  assert(store.projectItems(notices).every(notice => notice.isRead));
  assert.equal(store.projectItems(notices)[2].readAt, notices[2].readAt, "Bulk reads must preserve existing read timestamps");
  assert.equal(network.calls.length, 2);
  assert.equal(network.calls[1].url, "/api/notifications/read-all");
  network.calls[1].reply({ updated: 35 });
  await Promise.all([mutation, repeat, coveredRead]);
  assert.equal(network.calls.length, 2);
  assert.equal(store.getSnapshot().pending, false);
  store.dispose();
});

test("same-ID reads and queued mutations decrement once per notice and serialize writes", async () => {
  const network = transport();
  const store = createNotificationStore(false, network.fetcher);
  const a = item("a");
  const b = item("b");
  await seed(store, network, [a, b], 5);
  const first = store.markRead(a);
  const repeatedA = store.markRead(a);
  const queued = store.markRead(b);
  const repeatedB = store.markRead(b);
  assert.equal(first, repeatedA, "Repeated reads should join the pending write");
  assert.equal(network.calls.length, 2);
  network.calls[1].reply({ id: "a", isRead: true });
  await first;
  assert.equal(network.calls.length, 3);
  assert.equal(network.calls[2].url, "/api/notifications/b/read");
  network.calls[2].reply({ id: "b", isRead: true });
  await Promise.all([repeatedA, queued, repeatedB]);
  assert.equal(network.calls.length, 3);
  assert.equal(store.getSnapshot().count, 3);
  assert(store.projectItems([a, b]).every(notice => notice.isRead));
  store.dispose();
});

test("mark-all queued behind a read uses the latest count and makes one bulk PATCH", async () => {
  const network = transport();
  const store = createNotificationStore(false, network.fetcher);
  const notice = item("a");
  await seed(store, network, [notice], 14);
  const read = store.markRead(notice);
  const all = store.markAllRead();
  const repeatedAll = store.markAllRead();
  assert.equal(network.calls.length, 2);
  network.calls[1].reply({ id: "a", isRead: true });
  await read;
  assert.equal(network.calls.length, 3);
  assert.equal(network.calls[2].url, "/api/notifications/read-all");
  assert.equal(store.getSnapshot().count, 0);
  network.calls[2].reply({ updated: 13 });
  await Promise.all([all, repeatedAll]);
  assert.equal(network.calls.length, 3);
  assert.equal(store.getSnapshot().count, 0);
  store.dispose();
});

test("demo stores allow reads but never send mark-read PATCH requests", async () => {
  const network = transport();
  const store = createNotificationStore(true, network.fetcher);
  const notice = item("a");
  await seed(store, network, [notice], 4);
  await store.markRead(notice);
  await store.markAllRead();
  assert.equal(network.calls.length, 1);
  assert.equal(store.getSnapshot().count, 4);
  assert.equal(store.projectItems([notice])[0].isRead, false);
  store.dispose();
});

test("dispose aborts pending reads, clears private state and isolates the next account", async () => {
  const network = transport();
  const store = createNotificationStore(false, network.fetcher);
  await seed(store, network, [item("account-a")], 4);
  const pending = store.loadPreview();
  store.dispose();
  assert.equal(network.calls[1].signal?.aborted, true);
  assert.equal(store.getSnapshot().count, null);
  assert.equal(store.getSnapshot().preview, null);
  assert.deepEqual(store.getSnapshot().readOverrides, {});
  network.calls[1].reply({ items: [item("private-late-item")], unreadCount: 99 });
  await pending;
  assert.equal(store.getSnapshot().count, null);
  const next = createNotificationStore(false, network.fetcher);
  assert.equal(next.getSnapshot().count, null);
  assert.equal(next.getSnapshot().preview, null);
  await seed(next, network, [item("account-b")], 1);
  assert.equal(next.getSnapshot().count, 1);
  assert.equal(next.getSnapshot().preview?.[0].id, "account-b");
  assert.equal(store.getSnapshot().preview, null);
  next.dispose();
});

test("401 clears prior count and preview without a mutation rollback restoring them", async () => {
  const network = transport();
  const store = createNotificationStore(false, network.fetcher);
  const notice = item("a");
  await seed(store, network, [notice], 4);
  const mutation = store.markRead(notice);
  network.calls[1].reply(null, 401);
  await mutation;
  assert.equal(store.getSnapshot().count, null);
  assert.equal(store.getSnapshot().preview, null);
  assert.deepEqual(store.getSnapshot().readOverrides, {});
  assert.equal(store.getSnapshot().pending, false);
  assert.equal(network.calls.length, 2);
  store.dispose();
});

test("invalid history pagination cannot publish a count from a rejected response", async () => {
  const network = transport();
  const store = createNotificationStore(false, network.fetcher);
  await seed(store, network, [item("a")], 4);
  const history = store.loadHistory(1, false, new AbortController().signal);
  const rejected = assert.rejects(history, /pagination/i);
  network.calls[1].reply({ items: [item("invalid-page")], unreadCount: 99, page: 0, pageSize: 20, total: 99, totalPages: 5 });
  await rejected;
  assert.equal(store.getSnapshot().count, 4);
  store.dispose();
});

test("an older preview cannot undo read state learned from newer history", async () => {
  const network = transport();
  const store = createNotificationStore(false, network.fetcher);
  const stale = item("a");
  await seed(store, network, [stale], 4);
  const preview = store.loadPreview();
  const history = store.loadHistory(1, false, new AbortController().signal);
  network.calls[2].reply({ items: [item("a", true)], unreadCount: 3, page: 1, pageSize: 20, total: 4, totalPages: 1 });
  await history;
  network.calls[1].reply({ items: [stale], unreadCount: 4 });
  await preview;
  assert.equal(store.getSnapshot().count, 3);
  assert.equal(store.projectItems(store.getSnapshot().preview!)[0].isRead, true);
  await store.markRead(stale);
  assert.equal(network.calls.length, 3, "A stale unread row must not cause another PATCH for an already read notice");
  store.dispose();
});

test("cancelled history responses cannot publish over a newer page", async () => {
  const network = transport();
  const store = createNotificationStore(false, network.fetcher);
  const oldController = new AbortController();
  const stale = store.loadHistory(1, false, oldController.signal);
  const cancelled = assert.rejects(stale, { name: "AbortError" });
  oldController.abort();
  assert.equal(network.calls[0].signal?.aborted, true);
  const current = store.loadHistory(2, false, new AbortController().signal);
  network.calls[1].reply({ items: [item("new-page")], unreadCount: 3, page: 2, pageSize: 20, total: 21, totalPages: 2 });
  await current;
  network.calls[0].reply({ items: [item("old-page")], unreadCount: 99, page: 1, pageSize: 20, total: 99, totalPages: 5 });
  await cancelled;
  assert.equal(store.getSnapshot().count, 3);
  assert.equal(network.calls.length, 2);
  store.dispose();
});

test("history waits for a queued read mutation before fetching its page", async () => {
  const network = transport();
  const store = createNotificationStore(false, network.fetcher);
  const a = item("a");
  const b = item("b");
  await seed(store, network, [a, b], 4);
  const first = store.markRead(a);
  const queued = store.markRead(b);
  const history = store.loadHistory(1, false, new AbortController().signal);
  network.calls[1].reply({ id: "a", isRead: true });
  await first;
  assert.equal(network.calls.length, 3);
  assert.deepEqual(network.calls.map(call => call.method), ["GET", "PATCH", "PATCH"], "The page must not be fetched during the queued write");
  network.calls[2].reply({ id: "b", isRead: true });
  await queued;
  assert.equal(network.calls.length, 4);
  assert.equal(network.calls[3].method, "GET");
  network.calls[3].reply({ items: [item("a", true), item("b", true)], unreadCount: 2, page: 1, pageSize: 20, total: 4, totalPages: 1 });
  await history;
  assert.equal(store.getSnapshot().count, 2);
  assert(store.projectItems([a, b]).every(notice => notice.isRead));
  store.dispose();
});
