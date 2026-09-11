"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Calendar,
  Users,
  Stethoscope,
  BriefcaseMedical,
  FileBarChart2,
  PanelLeftClose,
  Bell,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SignOutButton } from "@/components/admin/sign-out";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

/* ─── Nav icon map ─── */
const iconMap: Record<string, LucideIcon> = {
  Dashboard: LayoutDashboard,
  Appointments: CalendarDays,
  Calendar: Calendar,
  Patients: Users,
  Dentists: Stethoscope,
  Services: BriefcaseMedical,
  Reports: FileBarChart2,
  Notifications: Bell,
};

/* ─── Props ─── */
export interface AdminSidebarProps {
  navItems: { href: string; label: string; roles: string[] }[];
  user: { name: string; role: string };
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function AdminSidebar({
  navItems,
  user,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const initial = user.name?.charAt(0)?.toUpperCase() ?? "S";
  const roleLabel = user.role?.toLowerCase() ?? "staff";

  /* ─── Shared sidebar content ─── */
  const sidebarContent = (
    <div className="flex h-full flex-col bg-sidebar-bg text-sidebar-text">
      {/* Brand + collapse */}
      <div className={`flex items-center justify-between px-3 py-4 ${collapsed ? "flex-col gap-3" : ""}`}>
        <Link href="/admin" className={`flex items-center gap-2.5 ${collapsed ? "flex-col" : ""}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg gradient-gold">
            <Stethoscope className="h-5 w-5 text-[#0E0F10]" strokeWidth={2} aria-hidden />
          </span>
          {!collapsed && (
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-sidebar-text">Aether Dental</span>
              <span className="text-xs text-sidebar-text-muted">Clinic Management</span>
            </span>
          )}
        </Link>

        {/* Desktop collapse button (hidden on mobile: the off-canvas drawer
            is closed with the header hamburger instead) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleCollapse}
              aria-label="Toggle sidebar"
              title="Toggle sidebar"
              className="hidden h-7 w-7 items-center justify-center rounded-lg text-sidebar-text-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-text md:flex"
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent>Toggle sidebar</TooltipContent>
        </Tooltip>
      </div>

      {/* Nav */}
      <nav className={`flex-1 space-y-1 overflow-y-auto px-2 py-2 ${collapsed ? "px-2" : ""}`}>
        {navItems.map((item) => {
          const Icon = iconMap[item.label] ?? LayoutDashboard;
          const active = pathname === item.href;

          const linkEl = (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              title={collapsed ? item.label : undefined}
              className={`group relative flex items-center gap-3 rounded-lg transition-colors ${
                collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5"
              } ${
                active
                  ? "bg-accent-soft font-semibold text-accent"
                  : "text-sidebar-text-muted hover:bg-sidebar-hover hover:text-sidebar-text"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
              {!collapsed && <span className="truncate text-sm">{item.label}</span>}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }
          return linkEl;
        })}
      </nav>

      {/* User + theme + sign out */}
      <div className={`border-t border-sidebar-border p-3 ${collapsed ? "px-2" : ""}`}>
        <div className={`flex ${collapsed ? "flex-col items-center gap-2" : "items-center justify-between gap-2"}`}>
          <div className={`flex items-center gap-2 ${collapsed ? "flex-col" : "min-w-0 flex-1"}`}>
            <div
              title={collapsed ? `${user.name} — ${roleLabel}` : undefined}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-[#0E0F10]"
            >
              {initial}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-sidebar-text">{user.name}</div>
                <div className="text-xs text-sidebar-text-muted">{roleLabel}</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="flex items-center gap-1.5">
              <ThemeToggle />
              <SignOutButton iconOnly />
            </div>
          )}
        </div>
        {collapsed && (
          <div className="mt-2 flex justify-center gap-1.5 border-t border-sidebar-border pt-2">
            <ThemeToggle />
            <SignOutButton iconOnly />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden animate-fade-in"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — mobile: fixed off-canvas; desktop: relative flex child */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-col border-r border-sidebar-border transition-all duration-300 md:relative md:inset-auto ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${collapsed ? "md:w-16" : "md:w-64"}`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}