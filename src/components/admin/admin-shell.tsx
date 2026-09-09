"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminHeader } from "@/components/admin/admin-header";

const STORAGE_KEY = "aether-sidebar-collapsed";

/* ─── Props ─── */
export interface AdminShellProps {
  navItems: { href: string; label: string; roles: string[] }[];
  user: { name: string; role: string };
  children: ReactNode;
}

export function AdminShell({ navItems, user, children }: AdminShellProps) {
  /* ─── Sidebar collapse state (desktop) ─── */
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  /* ─── Mobile off-canvas sidebar ─── */
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileOpenRef = useRef(false);

  useEffect(() => {
    mobileOpenRef.current = mobileOpen;
  }, [mobileOpen]);

  /* Persist collapse state */
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // localStorage may be unavailable
    }
  }, [collapsed]);

  const toggleCollapse = useCallback(() => setCollapsed((prev) => !prev), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const toggleMobile = useCallback(() => setMobileOpen((prev) => !prev), []);

  /* Escape closes the mobile sidebar */
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape" && mobileOpenRef.current) setMobileOpen(false);
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [handleEscape]);

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar
        navItems={navItems}
        user={user}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
      />

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader
          onToggleSidebar={toggleMobile}
          onToggleCollapse={toggleCollapse}
          user={user}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
        />
        <main className="flex-1 overflow-y-auto bg-background p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}