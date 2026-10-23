"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CheckCheck, Inbox, RefreshCw } from "lucide-react";
import { notificationColor, notificationIcon, typeLabel } from "./notification-meta";
import { timeAgo } from "@/lib/time";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

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

  /* â”€â”€â”€ Unread count (separate, lightweight fetch) â”€â”€â”€ */
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

  /* â”€â”€â”€ List (fresh fetch whenever the panel opens / retry is pressed) â”€â”€â”€ */
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

  /* â”€â”€â”€ Actions â”€â”€â”€ */
  async function markAllRead() {
    // Optimistic update with rollback so the UI can't desync from the server.
    const prevItems = items;
    const prevCount = count;
    setItems((prev) => prev?.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })) ?? prev);
    setCount(0);
    try {
      const res = await fetch("/api/notifications/read-all", { method: "PATCH" });
      if (!res.ok) throw new Error("Unable to mark all notifications as read.");
    } catch (err) {
      setItems(prevItems);
      setCount(prevCount);
      setError(err instanceof Error ? err.message : "Unable to mark all notifications as read.");
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
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications, no unread"}
              aria-haspopup="true"
              aria-expanded={open}
            >
              <Bell className="size-4 text-text-secondary max-compact:size-5" strokeWidth={2} aria-hidden />
              {count > 0 && (
                <span
                  className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-pill bg-error px-1 text-micro font-bold leading-none text-destructive-foreground"
                  aria-hidden
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-card border border-border bg-surface p-0 shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-text">Notifications</div>
            <div className="text-xs text-text-muted">{count} unread</div>
          </div>
          {unreadItems && (
            <Button
              onClick={markAllRead}
              variant="ghost"
              size="xs"
              className="rounded-chip text-accent"
            >
              <CheckCheck aria-hidden />
              Mark all as read
            </Button>
          )}
        </div>

        {/* Body */}
        <div className="max-h-112 overflow-y-auto">
          {error ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="text-sm text-error">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={() => setRetryKey((k) => k + 1)}
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Retry
              </Button>
            </div>
          ) : !items ? (
            <div className="space-y-2 px-4 py-4" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex animate-pulse gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-pill bg-background-alt" />
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
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill ${notificationColor(n.type)}`}>
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm font-medium ${n.isRead ? "text-text-secondary" : "text-text"}`}>
                            {typeLabel(n.type)}
                          </span>
                          {!n.isRead && (
                            <span className="h-2 w-2 shrink-0 rounded-pill bg-primary" aria-label="Unread" />
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-text-secondary">{n.message}</span>
                        <span className="mt-1 block text-eyebrow text-text-muted">{timeAgo(n.createdAt)}</span>
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
          <Button
            type="button"
            variant="ghost"
            size="default"
            onClick={() => {
              setOpen(false);
              if (pathname !== "/admin/notifications") router.push("/admin/notifications");
            }}
            className="w-full"
          >
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
