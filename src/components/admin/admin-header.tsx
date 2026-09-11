"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SignOutButton } from "@/components/admin/sign-out";
import { HamburgerButton } from "@/components/ui/hamburger-button";
import { NotificationBell } from "@/components/admin/notification-bell";

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
  onToggleCollapse: () => void;
  user: { name: string; role: string };
  collapsed: boolean;
  mobileOpen: boolean;
}

export function AdminHeader({ onToggleSidebar, onToggleCollapse, user, collapsed, mobileOpen }: AdminHeaderProps) {
  const pathname = usePathname();
  const title = pageTitleMap[pathname] ?? "Admin";
  const initial = user.name?.charAt(0)?.toUpperCase() ?? "S";
  const roleLabel = user.role?.toLowerCase() ?? "staff";

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /* Close dropdown on outside click */
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!dropdownOpen) return;
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen, handleClickOutside]);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/85 px-4 backdrop-blur">
      {/* Left: animated hamburger + title */}
      <div className="flex items-center gap-3">
        {/* Mobile: off-canvas sidebar toggle */}
        <HamburgerButton
          open={mobileOpen}
          onClick={onToggleSidebar}
          label="Toggle navigation menu"
          className="md:hidden"
        />
        {/* Desktop: collapse/expand sidebar toggle */}
        <HamburgerButton
          open={!collapsed}
          onClick={onToggleCollapse}
          label="Collapse sidebar"
          className="max-md:hidden"
        />
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-text">{title}</span>
          <span className="text-xs text-text-muted">Admin / {title}</span>
        </div>
      </div>

      {/* Right: notifications + theme toggle + user menu */}
      <div className="flex items-center gap-2">
        <NotificationBell />
        <ThemeToggle />
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-background-alt"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-[#0E0F10]">
              {initial}
            </div>
            <div className="hidden flex-col items-start text-left md:flex">
              <span className="text-sm font-medium leading-tight text-text">{user.name}</span>
              <span className="text-xs leading-tight text-text-muted">{roleLabel}</span>
            </div>
          </button>

          {/* Dropdown — always mounted and merely hidden, so the sign-out
              confirm dialog survives the outside-click (mousedown) close that
              would otherwise unmount it before the confirm click fires. */}
          <div
            className={`absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-surface shadow-lg ${
              dropdownOpen ? "block" : "hidden"
            }`}
          >
            {/* User info on mobile */}
            <div className="px-4 py-3 md:hidden">
              <div className="truncate text-sm font-semibold text-text">{user.name}</div>
              <div className="text-xs text-text-muted">{roleLabel}</div>
            </div>

            {/* Sign out */}
            <div className="border-t border-border px-2 py-2 md:border-t-0 md:pt-1">
              <SignOutButton variant="header" className="w-full justify-start" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}