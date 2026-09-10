"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BellDot, CheckCheck, ChevronLeft, ChevronRight, Inbox, RefreshCw } from "lucide-react";
import { notificationColor, notificationIcon, typeLabel } from "./notification-meta";
import { formatDateTime, timeAgo } from "@/lib/time";
import type { NotificationItem } from "./notification-bell";

const PAGE_SIZE = 20;

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function getPageItems(current: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set<number>([1, totalPages]);
  for (let p = current - 2; p <= current + 2; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const items: (number | "...")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) items.push("...");
    items.push(p);
    prev = p;
  }
  return items;
}

export function NotificationsHistory() {
  const router = useRouter();
  const pathname = usePathname();

  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (filter === "unread") qs.set("unread", "1");

    fetch(`/api/notifications?${qs.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(body.message || "Unable to load notifications.");
        setItems(body.data?.items || []);
        setPagination(body.data?.pagination || body.data ? { page, pageSize: PAGE_SIZE, total: body.data.total, totalPages: body.data.totalPages } : null);
        setUnreadCount(body.data?.unreadCount ?? 0);
        setError("");
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load notifications.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filter, page, refreshKey]);

  // Loading is controlled by explicit user actions (never synchronously inside
  // the effect), so user interactions re-show the loading state.
  function beginLoad() {
    setLoading(true);
    setError("");
  }

  function refresh() {
    beginLoad();
    setRefreshKey((k) => k + 1);
  }

  function changeFilter(next: "all" | "unread") {
    setFilter(next);
    setPage(1);
    beginLoad();
  }

  function goToPage(p: number) {
    setPage(p);
    beginLoad();
  }

  async function openNotification(n: NotificationItem) {
    if (!n.isRead) {
      setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, isRead: true, readAt: new Date().toISOString() } : x)) ?? prev);
      setUnreadCount((c) => Math.max(0, c - 1));
      fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" }).catch(() => {});
    }
    const target =
      n.entityType === "patient"
        ? "/admin/patients"
        : n.entityType === "dentist"
          ? "/admin/dentists"
          : "/admin/appointments";
    if (target !== pathname) router.push(target);
  }

  async function markAllRead() {
    setItems((prev) => prev?.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })) ?? prev);
    setUnreadCount(0);
    try {
      await fetch("/api/notifications/read-all", { method: "PATCH" });
    } catch {
      // non-fatal
    }
  }

  const start = pagination && pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const end = pagination ? Math.min(pagination.page * pagination.pageSize, pagination.total) : 0;

  return (
    <div>
      {/* Toolbar */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
          <button
            onClick={() => changeFilter("all")}
            aria-pressed={filter === "all"}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${filter === "all" ? "bg-accent-soft text-accent" : "text-text-secondary hover:text-text"}`}
          >
            All
          </button>
          <button
            onClick={() => changeFilter("unread")}
            aria-pressed={filter === "unread"}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${filter === "unread" ? "bg-accent-soft text-accent" : "text-text-secondary hover:text-text"}`}
          >
            Unread
            {unreadCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary transition-all hover:border-border-accent hover:bg-accent-soft hover:text-accent"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary transition-all hover:border-border-accent hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-error/20 bg-error-bg px-4 py-6 text-center">
          <p className="text-sm text-error">{error}</p>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition hover:border-accent hover:bg-accent-soft hover:text-accent"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface shadow">
        {error ? null : loading && !items ? (
          <div className="space-y-2 px-4 py-4" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex animate-pulse gap-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-background-alt" />
                <div className="flex-1 space-y-1.5 py-1">
                  <div className="h-3.5 w-2/3 rounded bg-background-alt" />
                  <div className="h-3 w-1/2 rounded bg-background-alt" />
                </div>
              </div>
            ))}
          </div>
        ) : !items || items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <Inbox className="h-10 w-10 text-text-muted" aria-hidden />
            <p className="text-sm font-medium text-text">You&apos;re all caught up.</p>
            <p className="text-xs text-text-muted">
              {filter === "unread" ? "No unread notifications." : "Notifications will appear here when something needs your attention."}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border overflow-hidden">
              {items.map((n) => {
                const Icon = notificationIcon(n.type);
                return (
                  <button
                    key={n.id}
                    onClick={() => openNotification(n)}
                    className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent-soft sm:px-5 ${
                      !n.isRead ? "bg-accent-soft/50" : ""
                    }`}
                  >
                    <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${notificationColor(n.type)}`}>
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-x-3">
                        <span className={`text-sm font-medium ${n.isRead ? "text-text-secondary" : "text-text"}`}>
                          {typeLabel(n.type)}
                        </span>
                        <span className="text-[11px] text-text-muted" title={formatDateTime(n.createdAt)}>
                          {timeAgo(n.createdAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-sm leading-snug text-text-secondary">{n.message}</span>
                      {!n.isRead && (
                        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                          <BellDot className="h-3 w-3" aria-hidden />
                          New
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
                <p className="text-sm text-text-muted">
                  Showing {start}–{end} of {pagination.total}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => goToPage(page - 1)}
                    disabled={page <= 1}
                    aria-label="Previous page"
                    className="rounded-lg border border-border p-1.5 text-text-secondary transition-colors hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {getPageItems(page, pagination.totalPages).map((item, i) =>
                    item === "..." ? (
                      <span key={`ellipsis-${i}`} className="px-1.5 text-sm text-text-muted">…</span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => goToPage(item)}
                        aria-current={item === page ? "page" : undefined}
                        className={`min-w-[2rem] rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
                          item === page ? "bg-accent text-[#0E0F10]" : "text-text-secondary hover:bg-accent-soft hover:text-accent"
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => goToPage(page + 1)}
                    disabled={!pagination || page >= pagination.totalPages}
                    aria-label="Next page"
                    className="rounded-lg border border-border p-1.5 text-text-secondary transition-colors hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}