"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminHeader } from "@/components/admin/admin-header";

const STORAGE_KEY = "aether-sidebar-collapsed";

export interface AdminNavItem {
  href: string;
  label: string;
  roles: string[];
  group?: string;
}

/* ─── Props ─── */
export interface AdminShellProps {
  navItems: AdminNavItem[];
  user: { name: string; role: string };
  children: ReactNode;
}

export function AdminShell({ navItems, user, children }: AdminShellProps) {
  /* ─── Sidebar collapse state (desktop) ─── */
  // Start expanded so the server and first client render agree, then adopt the
  // persisted value after mount. Reading localStorage during render would cause
  // a hydration mismatch on the sidebar classes.
  const [collapsed, setCollapsed] = useState(false);

  /* ─── Mobile off-canvas sidebar ─── */
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileOpenRef = useRef(false);

  useEffect(() => {
    mobileOpenRef.current = mobileOpen;
  }, [mobileOpen]);

  /* Adopt the persisted collapse state after mount */
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        if (localStorage.getItem(STORAGE_KEY) === "true") setCollapsed(true);
      } catch {
        // localStorage may be unavailable
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  /* Persist collapse state. Skip the first run so we never overwrite the stored
     value with the default before it has been adopted. */
  const didMountPersist = useRef(false);
  useEffect(() => {
    if (!didMountPersist.current) {
      didMountPersist.current = true;
      return;
    }
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
        <main className="admin-canvas flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}