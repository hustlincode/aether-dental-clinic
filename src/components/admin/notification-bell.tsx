"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CheckCheck, Inbox, RefreshCw } from "lucide-react";
import { notificationColor, notificationIcon, typeLabel } from "./notification-meta";
import { timeAgo } from "@/lib/time";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

const LIST_LIMIT = 10;

export function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  /* ─── Unread count (separate, lightweight fetch) ─── */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications/unread-count", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && body?.data && typeof body.data.count === "number") {
          setCount(body.data.count);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    function onFocus() {
      fetch("/api/notifications/unread-count", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => {
          if (body?.data && typeof body.data.count === "number") setCount(body.data.count);
        })
        .catch(() => {});
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  /* ─── List (fresh fetch whenever the panel opens / retry is pressed) ─── */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/notifications?pageSize=${LIST_LIMIT}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(body.message || "Unable to load notifications.");
        setError("");
        setItems(body.data?.items || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load notifications.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, retryKey]);

  /* ─── Actions ─── */
  async function markAllRead() {
    setItems((prev) => prev?.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })) ?? prev);
    setCount(0);
    try {
      await fetch("/api/notifications/read-all", { method: "PATCH" });
    } catch {
      // non-fatal
    }
  }

  async function openNotification(n: NotificationItem) {
    if (!n.isRead) {
      setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, isRead: true, readAt: new Date().toISOString() } : x)) ?? prev);
      setCount((c) => Math.max(0, c - 1));
      fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" }).catch(() => {});
    }
    setOpen(false);

    const target =
      n.entityType === "patient"
        ? "/admin/patients"
        : n.entityType === "dentist"
          ? "/admin/dentists"
          : "/admin/appointments";
    if (target !== pathname) router.push(target);
  }

  const unreadItems = items?.some((n) => !n.isRead) ?? false;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications, no unread"}
              aria-haspopup="true"
              aria-expanded={open}
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface transition-all hover:border-accent hover:bg-accent-soft"
            >
              <Bell className="h-4 w-4 text-text-secondary" strokeWidth={2} aria-hidden />
              {count > 0 && (
                <span
                  className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white"
                  aria-hidden
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-surface p-0 shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-text">Notifications</div>
            <div className="text-xs text-text-muted">{count} unread</div>
          </div>
          {unreadItems && (
            <button
              onClick={markAllRead}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              Mark all as read
            </button>
          )}
        </div>

        {/* Body */}
        <div className="max-h-[28rem] overflow-y-auto">
          {error ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="text-sm text-error">{error}</p>
              <button
                onClick={() => setRetryKey((k) => k + 1)}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition hover:border-accent hover:bg-accent-soft hover:text-accent"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Retry
              </button>
            </div>
          ) : !items ? (
            <div className="space-y-2 px-4 py-4" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex animate-pulse gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-background-alt" />
                  <div className="flex-1 space-y-1.5 py-1">
                    <div className="h-3 w-3/4 rounded bg-background-alt" />
                    <div className="h-2.5 w-1/2 rounded bg-background-alt" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center" role="status">
              <Inbox className="h-8 w-8 text-text-muted" aria-hidden />
              <p className="text-sm font-medium text-text">You&apos;re all caught up.</p>
              <p className="text-xs text-text-muted">No new notifications.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const Icon = notificationIcon(n.type);
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => openNotification(n)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent-soft ${
                        !n.isRead ? "bg-accent-soft/50" : ""
                      }`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${notificationColor(n.type)}`}>
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm font-medium ${n.isRead ? "text-text-secondary" : "text-text"}`}>
                            {typeLabel(n.type)}
                          </span>
                          {!n.isRead && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-text-secondary">{n.message}</span>
                        <span className="mt-1 block text-[11px] text-text-muted">{timeAgo(n.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2.5">
          <button
            onClick={() => {
              setOpen(false);
              if (pathname !== "/admin/notifications") router.push("/admin/notifications");
            }}
            className="w-full rounded-md px-2 py-1.5 text-center text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
          >
            View all notifications
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
