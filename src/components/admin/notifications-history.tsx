"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BellDot, CheckCheck, ChevronLeft, ChevronRight, Inbox, RefreshCw } from "lucide-react";
import { notificationColor, notificationIcon, typeLabel } from "./notification-meta";
import { formatDateTime, timeAgo } from "@/lib/time";
import type { NotificationItem } from "@/lib/client-notifications";
import { useNotifications } from "./notifications-provider";
import { SectionCard } from "./section-card";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";

const PAGE_SIZE = 20;

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Page numbers for the current window. `siblings` = how many pages to show either
 * side of the current one; `siblings: 0` yields the compact `1 … c … n` bar used
 * on narrow viewports, where a 40px target per button cannot fit seven of them.
 */
function getPageItems(current: number, totalPages: number, siblings = 2): (number | "...")[] {
  if (totalPages <= siblings * 2 + 3) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set<number>([1, totalPages]);
  for (let p = current - siblings; p <= current + siblings; p++) {
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
  const [loadedItems, setItems] = useState<NotificationItem[] | null>(null);
  const [loadedPagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const { count, loadHistory, markRead, markAllRead, projectItems, pending, isDemo } = useNotifications();
  const unreadCount = count ?? 0;
  const projected = loadedItems === null ? null : projectItems(loadedItems);
  const items = filter === "unread" ? projected?.filter((item) => !item.isRead) ?? null : projected;
  const pagination = loadedPagination && filter === "unread" && count !== null
    ? { ...loadedPagination, total: count, totalPages: Math.ceil(count / PAGE_SIZE) }
    : loadedPagination;

  useEffect(() => {
    const controller = new AbortController();
    loadHistory(page, filter === "unread", controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setItems(data.items);
        setPagination({ page: data.page, pageSize: data.pageSize, total: data.total, totalPages: data.totalPages });
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load notifications.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [filter, page, refreshKey, loadHistory]);

  // Loading is controlled by explicit user actions (never synchronously inside
  // the effect), so user interactions re-show the loading state.
  function beginLoad() {
    setLoading(true);
    setError("");
  }

  function refresh() {
    beginLoad();
    if (filter === "unread" && pagination && page > Math.max(1, pagination.totalPages)) setPage(1);
    setRefreshKey((k) => k + 1);
  }

  function changeFilter(next: "all" | "unread") {
    if (next === filter) return;
    setFilter(next);
    setPage(1);
    beginLoad();
  }

  function goToPage(p: number) {
    if (p === page) return;
    setPage(p);
    beginLoad();
  }

  function openNotification(n: NotificationItem) {
    if (!n.isRead && !isDemo) void markRead(n);
    const target =
      n.entityType === "patient"
        ? "/admin/patients"
        : n.entityType === "dentist"
          ? "/admin/dentists"
          : "/admin/appointments";
    if (target !== pathname) router.push(target);
  }

  const start = pagination && pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const end = pagination ? Math.min(pagination.page * pagination.pageSize, pagination.total) : 0;

  return (
    <div>
      {/* Toolbar */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-control border border-border bg-surface p-1">
          <button
            onClick={() => changeFilter("all")}
            aria-pressed={filter === "all"}
            className={`inline-flex h-10 items-center rounded-chip px-3 text-sm font-medium transition-colors ${filter === "all" ? "bg-background-alt text-text" : "text-text-secondary hover:text-text"}`}
          >
            All
          </button>
          <button
            onClick={() => changeFilter("unread")}
            aria-pressed={filter === "unread"}
            className={`inline-flex h-10 items-center gap-1.5 rounded-chip px-3 text-sm font-medium transition-colors ${filter === "unread" ? "bg-background-alt text-text" : "text-text-secondary hover:text-text"}`}
          >
            Unread
            {unreadCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-pill bg-error px-1 text-micro font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="inline-flex h-11 items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-sm font-medium text-text-secondary transition-all hover:border-border-accent hover:bg-accent-soft hover:text-accent"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {!isDemo && <button
            onClick={markAllRead}
            disabled={unreadCount === 0 || pending}
            className="inline-flex h-11 items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-sm font-medium text-text-secondary transition-all hover:border-border-accent hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </button>}
        </div>
      </div>

      {error ? (
        <ErrorState className="mt-4" message={error} onRetry={refresh} />
      ) : (
        <SectionCard padded={false} className="mt-4">
          {loading && !items ? (
            <div className="space-y-2 px-4 py-4" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex animate-pulse gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-pill bg-background-alt" />
                  <div className="flex-1 space-y-1.5 py-1">
                    <div className="h-3.5 w-2/3 rounded bg-background-alt" />
                    <div className="h-3 w-1/2 rounded bg-background-alt" />
                  </div>
                </div>
              ))}
            </div>
          ) : !items || items.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="You're all caught up."
              description={filter === "unread" ? "No unread notifications." : "Notifications will appear here when something needs your attention."}
            />
          ) : (
            <>
              <div
                className={`divide-y divide-border overflow-hidden ${loading ? "opacity-60 transition-opacity" : ""}`}
                aria-busy={loading}
              >
              {items.map((n) => {
                const Icon = notificationIcon(n.type);
                return (
                  <button
                    key={n.id}
                    onClick={() => openNotification(n)}
                    disabled={pending}
                    className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent-soft sm:px-5 ${
                      !n.isRead ? "bg-accent-soft/50" : ""
                    }`}
                  >
                    <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-pill ${notificationColor(n.type)}`}>
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-x-3">
                        <span className={`text-sm font-medium ${n.isRead ? "text-text-secondary" : "text-text"}`}>
                          {typeLabel(n.type)}
                        </span>
                        <span className="text-eyebrow text-text-muted" title={formatDateTime(n.createdAt)}>
                          {timeAgo(n.createdAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-sm leading-snug text-text-secondary">{n.message}</span>
                      {!n.isRead && (
                        <span className="mt-1.5 inline-flex items-center gap-1 rounded-pill bg-accent-soft px-2 py-0.5 text-eyebrow font-semibold uppercase tracking-wide text-accent">
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
                    className="flex size-10 items-center justify-center rounded-control border border-border text-text-secondary transition-colors hover:bg-background-alt hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {/* P0.3: the wide 7-item window needs ~392px at 40px targets and
                      overflows a 360px viewport, so narrow screens get a compact
                      1 … c … n bar instead. `display:none` keeps the hidden copy
                      out of the tab order and the accessibility tree. */}
                  <div className="hidden items-center gap-1 sm:flex">
                    {getPageItems(page, pagination.totalPages, 2).map((item, i) =>
                      item === "..." ? (
                        <span key={`ellipsis-${i}`} className="px-1.5 text-sm text-text-muted">…</span>
                      ) : (
                        <button
                          key={item}
                          onClick={() => goToPage(item)}
                          aria-current={item === page ? "page" : undefined}
                          className={`flex size-10 items-center justify-center rounded-control text-sm font-medium transition-colors ${
                            item === page ? "bg-foreground text-background" : "text-text-secondary hover:bg-background-alt hover:text-text"
                          }`}
                        >
                          {item}
                        </button>
                      )
                    )}
                  </div>
                  <div className="flex items-center gap-1 sm:hidden">
                    {getPageItems(page, pagination.totalPages, 0).map((item, i) =>
                      item === "..." ? (
                        <span key={`ellipsis-compact-${i}`} className="px-1.5 text-sm text-text-muted">…</span>
                      ) : (
                        <button
                          key={item}
                          onClick={() => goToPage(item)}
                          aria-current={item === page ? "page" : undefined}
                          className={`flex size-10 items-center justify-center rounded-control text-sm font-medium transition-colors ${
                            item === page ? "bg-foreground text-background" : "text-text-secondary hover:bg-background-alt hover:text-text"
                          }`}
                        >
                          {item}
                        </button>
                      )
                    )}
                  </div>
                  <button
                    onClick={() => goToPage(page + 1)}
                    disabled={!pagination || page >= pagination.totalPages}
                    aria-label="Next page"
                    className="flex size-10 items-center justify-center rounded-control border border-border text-text-secondary transition-colors hover:bg-background-alt hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            </>
          )}
        </SectionCard>
      )}
    </div>
  );
}
