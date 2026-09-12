"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CalendarClock, CalendarX, RefreshCw, X } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, useDataTable, type FilterableDataTableFeatures } from "./data-table";
import { StatusBadge } from "./status-badge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { StatTone } from "@/components/admin/stat-card";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AvailabilityRow {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  isWorking: boolean;
}

interface UpcomingAppointment {
  id: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: string;
  patient: { firstName: string; lastName: string };
  service: { name: string };
}

interface DentistDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  specialization: string;
  profileImage: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
  availability: AvailabilityRow[];
}

interface DentistDetailsData {
  dentist: DentistDetail;
  stats: {
    totalAppointments: number;
    upcomingCount: number;
  };
  upcoming: UpcomingAppointment[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

function fmtDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => !/^dr\.?$/i.test(p));
  if (parts.length === 0) return "?";
  const first = parts[0];
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  return `${first[0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

// ─── Upcoming Appointments Columns ───────────────────────────────────────────

const columnHelper = createColumnHelper<FilterableDataTableFeatures, UpcomingAppointment>();

const columns = columnHelper.columns([
  columnHelper.accessor((a) => a.appointmentDate, {
    id: "date",
    header: "Date",
    cell: (info) => <span className="whitespace-nowrap text-text">{fmtDate(info.getValue())}</span>,
  }),
  columnHelper.accessor((a) => a.startTime, {
    id: "time",
    header: "Time",
    cell: (info) => <span className="whitespace-nowrap text-text-secondary">{fmtTime(info.getValue())}</span>,
  }),
  columnHelper.accessor((a) => `${a.patient.firstName} ${a.patient.lastName}`, {
    id: "patient",
    header: "Patient",
    meta: { cellClassName: "hidden sm:table-cell" },
    cell: (info) => <span className="text-text-secondary">{info.getValue()}</span>,
  }),
  columnHelper.accessor((a) => a.service?.name ?? "", {
    id: "service",
    header: "Service",
    meta: { cellClassName: "hidden sm:table-cell" },
    cell: (info) => <span className="text-text-secondary">{info.row.original.service.name}</span>,
  }),
  columnHelper.accessor((a) => a.status, {
    id: "status",
    header: "Status",
    cell: (info) => <StatusBadge status={info.getValue()} />,
  }),
]);

// ─── Dentist Details Drawer ──────────────────────────────────────────────────

export function DentistDetails({
  open,
  dentistId,
  onClose,
}: {
  open: boolean;
  dentistId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<DentistDetailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const table = useDataTable({
    columns,
    data: data?.upcoming ?? [],
    getRowId: (row, index) => `${row.appointmentDate}-${row.startTime}-${row.patient.firstName}-${index}`,
    options: { initialState: { pagination: { pageIndex: 0, pageSize: 100000 } } },
  });

  // Fetch dentist details whenever the drawer opens. Loading starts as true via
  // remount (parent keys this component by dentist id), so no synchronous
  // setState is needed inside the effect body.
  useEffect(() => {
    if (!open || !dentistId) return;
    let cancelled = false;

    fetch(`/api/dentists/${dentistId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message);
        if (!cancelled) setData(body.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load dentist details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, dentistId, refreshKey]);

  function retry() {
    if (!dentistId) return;
    setLoading(true);
    setError("");
    setRefreshKey((k) => k + 1);
  }

  if (!dentistId) return null;

  const dentist = data?.dentist ?? null;
  const stats = data?.stats ?? null;

  const schedule = dentist
    ? DAY_ORDER.map((day) => dentist.availability.find((a) => a.dayOfWeek === day))
    : [];

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" showCloseButton={false} className="w-full max-w-md gap-0 border-l border-border-strong bg-surface p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <SheetTitle className="text-lg font-bold text-text">Dentist Details</SheetTitle>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface-alt hover:text-text"
                aria-label="Close dentist details"
              >
                <X size={18} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && !data ? (
            <div className="space-y-4" aria-busy="true">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 animate-pulse rounded-full bg-surface-alt" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/2 animate-pulse rounded bg-surface-alt" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-surface-alt" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-alt" />
                ))}
              </div>
              <div className="h-40 animate-pulse rounded-lg bg-surface-alt" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-error-bg">
                <AlertCircle size={24} className="text-error" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-text">Unable to load dentist</h3>
              <p className="mt-1 max-w-sm text-sm text-text-muted">{error}</p>
              <button
                onClick={retry}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition hover:border-border-accent hover:bg-accent-soft hover:text-accent"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </button>
            </div>
          ) : data && dentist && stats ? (
            <>
              {/* Dentist header */}
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={dentist.profileImage || undefined} alt={dentist.name} />
                  <AvatarFallback className="gradient-gold text-sm text-primary-foreground">
                    {initials(dentist.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-text">{dentist.name}</p>
                  <p className="truncate text-sm text-text-secondary">{dentist.specialization}</p>
                  <p className="truncate text-sm text-text-muted">{dentist.email}</p>
                  {dentist.phone && <p className="truncate text-sm text-text-muted">{dentist.phone}</p>}
                </div>
                <span
                  className={`ml-auto shrink-0 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    dentist.status === "ACTIVE" ? "bg-success-bg text-success" : "bg-neutral-bg text-neutral-c"
                  }`}
                >
                  {dentist.status === "ACTIVE" ? "Active" : "Inactive"}
                </span>
              </div>

              {/* Manage schedule (Phase 4 page) */}
              <Link
                href={`/admin/dentists/${dentist.id}`}
                onClick={onClose}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface-alt px-4 py-2.5 text-sm font-medium text-text-secondary transition hover:border-border-accent hover:bg-accent-soft hover:text-accent"
              >
                <CalendarClock size={16} />
                Manage Schedule
              </Link>

              {/* Stats grid */}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <StatCard label="Total Appointments" value={String(stats.totalAppointments)} tone="neutral" />
                <StatCard label="Upcoming" value={String(stats.upcomingCount)} tone="accent" />
              </div>

              {/* Weekly schedule */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-text">Weekly Schedule</h3>
                <div className="mt-3 overflow-hidden rounded-xl border border-border">
                  {schedule.map((row, index) => (
                    <div
                      key={DAY_ORDER[index]}
                      className={`flex items-center justify-between px-3 py-2 text-sm ${
                        index % 2 === 0 ? "bg-surface-alt" : "bg-surface"
                      }`}
                    >
                      <span className="font-medium text-text">{DAY_LABELS[DAY_ORDER[index]]}</span>
                      <span className="text-text-secondary">
                        {row && row.isWorking
                          ? `${fmtTime(row.startTime)} – ${fmtTime(row.endTime)}`
                          : "Off"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Upcoming appointments */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-text">Upcoming Appointments</h3>
                {data.upcoming.length === 0 ? (
                  <div className="mt-3 flex flex-col items-center rounded-xl border border-border bg-surface-alt px-6 py-10 text-center">
                    <CalendarX size={28} className="text-text-muted" />
                    <p className="mt-3 text-sm text-text-secondary">No upcoming appointments</p>
                    <p className="mt-1 text-xs text-text-muted">This dentist has no upcoming appointments.</p>
                  </div>
                ) : (
                  <div className="card-surface mt-3 overflow-hidden">
                    <DataTable table={table} />
                  </div>
                )}
                {data.upcoming.length > 0 && (
                  <p className="mt-2 text-xs text-text-muted">Showing the {data.upcoming.length} next appointments.</p>
                )}
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const STAT_TONE_STYLES: Record<StatTone, string> = {
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
  info: "text-info",
  neutral: "text-text",
};

function StatCard({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: StatTone }) {
  return (
    <div className="rounded-lg border border-border bg-surface-alt px-3 py-2.5">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-1 truncate text-base font-semibold ${STAT_TONE_STYLES[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-text-muted">{sub}</p>}
    </div>
  );
}