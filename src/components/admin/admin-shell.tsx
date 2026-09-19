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
  /* ─── Sidebar collapse state (desktop) ───
     The toggle lives inside the sidebar itself — the header has no burger in
     web view. Start expanded so SSR and the first client render agree, then
     adopt the persisted value after mount. */
  const [collapsed, setCollapsed] = useState(false);
  const [collapseHydrated, setCollapseHydrated] = useState(false);

  /* ─── Mobile off-canvas sidebar ─── */
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileOpenRef = useRef(false);

  useEffect(() => {
    mobileOpenRef.current = mobileOpen;
  }, [mobileOpen]);

  /* Adopt the persisted collapse state after mount. Deferred by a tick so we
     never call setState synchronously inside the effect (and so StrictMode's
     double-invoke stays harmless). */
  useEffect(() => {
    const id = window.setTimeout(() => {
      let stored = false;
      try {
        stored = localStorage.getItem(STORAGE_KEY) === "true";
      } catch {
        // localStorage may be unavailable
      }
      setCollapsed(stored);
      setCollapseHydrated(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  /* Persist collapse state — only once the stored value has been adopted, so a
     StrictMode double-invoke (or any re-render before hydration completes) can
     never overwrite the saved value with the default. */
  useEffect(() => {
    if (!collapseHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // localStorage may be unavailable
    }
  }, [collapsed, collapseHydrated]);

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
        <AdminHeader onToggleSidebar={toggleMobile} user={user} mobileOpen={mobileOpen} />
        <main className="admin-canvas flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
