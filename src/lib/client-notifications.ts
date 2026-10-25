export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  unreadCount: number;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function createNotificationStore(isDemo: boolean, fetcher: typeof fetch = fetch) {
  let state = {
    count: null as number | null,
    preview: null as NotificationItem[] | null,
    previewLoading: false,
    previewError: "",
    mutationError: "",
    pending: false,
    readOverrides: {} as Record<string, string>,
  };
  const listeners = new Set<() => void>();
  const controllers = new Set<AbortController>();
  const knownItems = new Map<string, { item: NotificationItem; sequence: number }>();
  let disposed = false;
  let initialized = false;
  let revision = 0;
  let readSequence = 0;
  let appliedRead = 0;
  let mutation: { key: string; promise: Promise<void> } | null = null;
  let previewFlight: { revision: number; controller: AbortController; promise: Promise<void> } | null = null;

  function update(patch: Partial<typeof state>) {
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }

  async function request(url: string, method = "GET", signal?: AbortSignal) {
    if (disposed || signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    controllers.add(controller);
    try {
      const response = await fetcher(url, { method, cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (disposed || controller.signal.aborted) throw new DOMException("Request cancelled", "AbortError");
      if (response.status === 401) {
        revision++;
        knownItems.clear();
        update({ count: null, preview: null, readOverrides: {} });
      }
      if (!response.ok || body.success !== true) throw new Error(body.message || "Unable to update notifications.");
      return body.data;
    } finally {
      controllers.delete(controller);
      signal?.removeEventListener("abort", abort);
    }
  }

  function applyCount(count: unknown, startedRevision: number, sequence: number) {
    if (!validCount(count)) throw new Error("Invalid unread notification count.");
    if (startedRevision === revision && !mutation && sequence >= appliedRead) {
      appliedRead = sequence;
      update({ count });
    }
  }

  function acceptList(data: { items: NotificationItem[]; unreadCount: number }, startedRevision: number, sequence: number) {
    if (!Array.isArray(data?.items) || !validCount(data.unreadCount)) throw new Error("Unable to load notifications.");
    if (disposed) throw new DOMException("Request cancelled", "AbortError");
    if (startedRevision !== revision || mutation) throw new Error("Notifications changed while loading. Please refresh.");
    data.items.forEach((item) => {
      const known = knownItems.get(item.id);
      if (!known || sequence >= known.sequence) knownItems.set(item.id, { item, sequence });
    });
    applyCount(data.unreadCount, startedRevision, sequence);
    update({});
  }

  function projectItems(items: NotificationItem[]) {
    return items.map((item) => {
      const known = knownItems.get(item.id)?.item ?? item;
      return { ...item, isRead: !!state.readOverrides[item.id] || known.isRead, readAt: state.readOverrides[item.id] ?? known.readAt };
    });
  }

  async function initialize() {
    if (initialized || disposed || state.count !== null) return;
    initialized = true;
    const startedRevision = revision;
    const sequence = ++readSequence;
    try {
      const data = await request("/api/notifications/unread-count");
      applyCount(data?.count, startedRevision, sequence);
    } catch {
      // Opening notifications retries through the list response; an unknown count is never shown as zero.
    }
  }

  function loadPreview(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (mutation) return mutation.promise.then(loadPreview);
    if (previewFlight?.revision === revision) return previewFlight.promise;
    previewFlight?.controller.abort();
    const flight = { revision, controller: new AbortController(), promise: Promise.resolve() };
    const sequence = ++readSequence;
    update({ previewLoading: true, previewError: "", mutationError: "" });
    flight.promise = (async () => {
      try {
        const data = await request("/api/notifications?view=preview&pageSize=10", "GET", flight.controller.signal);
        if (previewFlight !== flight) return;
        acceptList(data, flight.revision, sequence);
        update({ preview: data.items });
      } catch (error) {
        if (!disposed && !flight.controller.signal.aborted && previewFlight === flight) {
          update({ previewError: error instanceof Error ? error.message : "Unable to load notifications." });
        }
      } finally {
        if (previewFlight === flight) {
          previewFlight = null;
          update({ previewLoading: false });
        }
      }
    })();
    previewFlight = flight;
    return flight.promise;
  }

  async function loadHistory(page: number, unreadOnly: boolean, signal: AbortSignal): Promise<NotificationPage> {
    while (mutation) await mutation.promise;
    const startedRevision = revision;
    const sequence = ++readSequence;
    const query = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (unreadOnly) query.set("unread", "1");
    const data = await request(`/api/notifications?${query}`, "GET", signal);
    if (!data || !Number.isInteger(data.page) || data.page < 1 || !Number.isInteger(data.pageSize) || data.pageSize < 1 ||
      !validCount(data.total) || !validCount(data.totalPages)) throw new Error("Invalid notification pagination.");
    acceptList(data, startedRevision, sequence);
    return data;
  }

  function mutate(key: string, item?: NotificationItem): Promise<void> {
    if (isDemo || disposed) return Promise.resolve();
    if (mutation) return mutation.key === key ? mutation.promise : mutation.promise.then(() => mutate(key, item));
    if (item && (item.isRead || knownItems.get(item.id)?.item.isRead || state.readOverrides[item.id])) return Promise.resolve();
    const before = { count: state.count, readOverrides: state.readOverrides };
    const startedRevision = ++revision;
    const readAt = new Date().toISOString();
    const readOverrides = { ...state.readOverrides };
    if (item) readOverrides[item.id] = readAt;
    else knownItems.forEach(({ item: known }) => { if (!known.isRead && !readOverrides[known.id]) readOverrides[known.id] = readAt; });
    update({
      count: item ? state.count === null ? null : Math.max(0, state.count - 1) : 0,
      readOverrides, pending: true, mutationError: "",
    });
    const operation = { key, promise: Promise.resolve() };
    operation.promise = (async () => {
      try {
        await request(item ? `/api/notifications/${encodeURIComponent(item.id)}/read` : "/api/notifications/read-all", "PATCH");
      } catch (error) {
        if (revision === startedRevision) update(before);
        if (!disposed) update({ mutationError: error instanceof Error ? error.message : "Unable to update notifications." });
      } finally {
        revision++;
        mutation = null;
        update({ pending: false });
      }
    })();
    mutation = operation;
    return operation.promise;
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    initialize,
    loadPreview,
    loadHistory,
    projectItems,
    markRead: (item: NotificationItem) => mutate(item.id, item),
    markAllRead: () => mutation?.key === "all" ? mutation.promise : state.count === 0 ? Promise.resolve() : mutate("all"),
    isDemo,
    dispose: () => {
      disposed = true;
      revision++;
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
      knownItems.clear();
      listeners.clear();
      state = { ...state, count: null, preview: null, readOverrides: {}, previewError: "", mutationError: "", pending: false, previewLoading: false };
    },
  };
}
