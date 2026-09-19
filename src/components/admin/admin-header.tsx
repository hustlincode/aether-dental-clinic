"use client";

import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SignOutButton } from "@/components/admin/sign-out";
import { HamburgerButton } from "@/components/ui/hamburger-button";
import { NotificationBell } from "@/components/admin/notification-bell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ─── Page title map ─── */
const pageTitleMap: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/appointments": "Appointments",
  "/admin/calendar": "Calendar",
  "/admin/patients": "Patients",
  "/admin/dentists": "Dentists",
  "/admin/services": "Services",
  "/admin/reports": "Reports",
  "/admin/notifications": "Notifications",
};

/* ─── Props ─── */
export interface AdminHeaderProps {
  onToggleSidebar: () => void;
  user: { name: string; role: string };
  mobileOpen: boolean;
}

export function AdminHeader({ onToggleSidebar, user, mobileOpen }: AdminHeaderProps) {
  const pathname = usePathname();
  const title = pageTitleMap[pathname] ?? "Admin";
  const initial = user.name?.charAt(0)?.toUpperCase() ?? "S";
  const roleLabel = user.role?.toLowerCase() ?? "staff";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/85 px-4 backdrop-blur">
      {/* Left: mobile drawer toggle + title */}
      <div className="flex items-center gap-3">
        {/* Mobile only — the desktop sidebar is always expanded and has no toggle */}
        <HamburgerButton
          open={mobileOpen}
          onClick={onToggleSidebar}
          label="Toggle navigation menu"
          className="md:hidden"
        />
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-text">{title}</span>
          <span className="text-xs text-text-muted">Admin / {title}</span>
        </div>
      </div>

      {/* Right: theme + notifications + user menu.
          The theme toggle lives here in every viewport (global control).
          The user menu is mobile-only — on desktop the sidebar footer owns the
          user identity, so showing it here too would duplicate it. */}
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center rounded-lg p-1 transition hover:bg-background-alt md:hidden"
              aria-label="Open user menu"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-primary-foreground">
                {initial}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60 bg-surface">
            <div className="px-4 py-3">
              <div className="truncate text-sm font-semibold text-text">{user.name}</div>
              <div className="text-xs text-text-muted">{roleLabel}</div>
            </div>
            <DropdownMenuSeparator />
            <div className="px-2 py-2">
              <SignOutButton variant="header" className="w-full justify-start" />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
