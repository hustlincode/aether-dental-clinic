"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CheckCheck, Inbox, RefreshCw } from "lucide-react";
import { notificationColor, notificationIcon, typeLabel } from "./notification-meta";
import { timeAgo } from "@/lib/time";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

import { useNotifications } from "./notifications-provider";
import type { NotificationItem } from "@/lib/client-notifications";

export type { NotificationItem } from "@/lib/client-notifications";

export function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { count, preview, previewError: error, previewLoading, pending, isDemo, loadPreview, markRead, markAllRead, projectItems } = useNotifications();
  const items = preview === null ? null : projectItems(preview);
  const hasUnread = (count ?? 0) > 0;

  function openNotification(n: NotificationItem) {
    if (!n.isRead && !isDemo) void markRead(n);
    setOpen(false);
    const target = n.entityType === "patient" ? "/admin/patients" : n.entityType === "dentist" ? "/admin/dentists" : "/admin/appointments";
    if (target !== pathname) router.push(target);
  }

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) void loadPreview(); }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={count === null ? "Notifications" : hasUnread ? `Notifications, ${count} unread` : "Notifications, no unread"}
              aria-haspopup="true"
              aria-expanded={open}
            >
              <Bell className="size-4 text-text-secondary max-compact:size-5" strokeWidth={2} aria-hidden />
              {hasUnread && count !== null && (
                <span
                  className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-pill bg-error px-1 text-micro font-bold leading-none text-white"
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
            <div className="text-xs text-text-muted">{count === null ? "Unread count not loaded" : `${count} unread`}</div>
          </div>
          {hasUnread && !isDemo && (
            <Button
              onClick={markAllRead}
              disabled={pending}
              variant="ghost"
              size="xs"
              className="rounded-chip text-text-secondary hover:bg-background-alt hover:text-text"
            >
              <CheckCheck aria-hidden />
              Mark all as read
            </Button>
          )}
        </div>

        {/* Body */}
        <div className="max-h-112 overflow-y-auto">
          {previewLoading && items && <p role="status" className="px-4 py-2 text-xs text-text-muted">Refreshing notifications...</p>}
          {error ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="text-sm text-error">{error}</p>
              <button
                onClick={() => void loadPreview()}
                disabled={previewLoading}
                className="inline-flex h-10 items-center gap-2 rounded-control border border-border bg-surface px-3 text-sm font-medium text-text-secondary transition hover:border-accent hover:bg-accent-soft hover:text-accent"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Retry
              </button>
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
                      disabled={pending}
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
                            <span className="h-2 w-2 shrink-0 rounded-pill bg-accent-fill" aria-label="Unread" />
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
          <button
            onClick={() => {
              setOpen(false);
              if (pathname !== "/admin/notifications") router.push("/admin/notifications");
            }}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-chip px-2 text-center text-sm font-medium text-text-secondary transition-colors hover:bg-background-alt hover:text-text"
          >
            View all notifications
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
