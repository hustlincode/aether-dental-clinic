"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CalendarClock, CalendarX, Mail, Phone, RefreshCw, X } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, useDataTable, type FilterableDataTableFeatures } from "./data-table";
import { StatusBadge } from "./status-badge";
import { Sheet, SheetBody, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
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
  returnFocusTo,
  onClose,
}: {
  open: boolean;
  dentistId: string | null;
  returnFocusTo?: string | null;
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

  // Keep the last loaded profile visible while refreshing the same dentist.
  useEffect(() => {
    if (!open || !dentistId) return;
    let cancelled = false;

    fetch(`/api/dentists/${dentistId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message);
        if (!cancelled) {
          setError("");
          setData(body.data);
        }
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
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 bg-surface p-0 sm:max-w-lg" onCloseAutoFocus={(event) => {
        const trigger = returnFocusTo ? document.querySelector<HTMLElement>(returnFocusTo) : null;
        if (trigger) {
          event.preventDefault();
          trigger.focus();
        }
      }}>
        {/* Header */}
        <SheetHeader className="flex-row items-start justify-between gap-4 pr-6">
          <div className="flex flex-col gap-1">
            <SheetTitle>Dentist Details</SheetTitle>
            <SheetDescription>Profile, working hours, and upcoming appointments.</SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close dentist details"><X aria-hidden="true" /></Button>
          </SheetClose>
        </SheetHeader>

        {/* Body */}
        <SheetBody>
          {loading && !data ? (
            <div className="flex flex-col gap-4" aria-busy="true">
              <div className="flex items-center gap-3">
                <Skeleton className="size-12 rounded-control" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-control" />
                ))}
              </div>
              <Skeleton className="h-40 rounded-control" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-pill bg-error-bg">
                <AlertCircle size={24} className="text-error" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-text">Unable to load dentist</h3>
              <p className="mt-1 max-w-sm text-sm text-text-muted">{error}</p>
              <Button onClick={retry} variant="outline" className="mt-4">
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
            </div>
          ) : data && dentist && stats ? (
            <>
              {/* Dentist header */}
              <div className="flex items-start gap-4">
                <Avatar className="size-12 shrink-0 rounded-control border border-border">
                  <AvatarImage src={dentist.profileImage || undefined} alt={dentist.name} />
                  <AvatarFallback className="rounded-control bg-accent-soft text-base font-semibold text-accent">
                    {initials(dentist.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
                  <h3 className="break-words text-xl font-semibold tracking-tight text-text">{dentist.name}</h3>
                  <p className="break-words text-sm text-text-secondary">{dentist.specialization}</p>
                  <Badge variant="secondary" className={cn(dentist.status === "ACTIVE" ? "bg-success-bg text-success" : "bg-neutral-bg text-neutral-c")}>
                    {dentist.status === "ACTIVE" ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>

              <dl className="mt-6 flex flex-col gap-4 border-y border-border py-5 text-sm">
                <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
                  <dt className="flex items-center gap-2 text-text-muted"><Mail size={15} aria-hidden="true" />Email</dt>
                  <dd className="break-words text-text">{dentist.email}</dd>
                </div>
                {dentist.phone && (
                  <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
                    <dt className="flex items-center gap-2 text-text-muted"><Phone size={15} aria-hidden="true" />Phone</dt>
                    <dd className="break-words text-text">{dentist.phone}</dd>
                  </div>
                )}
              </dl>

              {/* Stats grid */}
              <div className="mt-6 grid grid-cols-2 gap-4 border-b border-border pb-5">
                <StatCard label="Total Appointments" value={String(stats.totalAppointments)} tone="neutral" />
                <StatCard label="Upcoming" value={String(stats.upcomingCount)} tone="accent" />
              </div>

              {/* Weekly schedule */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-text">Weekly Schedule</h3>
                <dl className="mt-3 divide-y divide-border">
                  {schedule.map((row, index) => (
                    <div
                      key={DAY_ORDER[index]}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm"
                    >
                      <dt className="font-medium text-text">{DAY_LABELS[DAY_ORDER[index]]}</dt>
                      <dd className="text-text-secondary tabular-nums">
                        {row && row.isWorking
                          ? `${fmtTime(row.startTime)} – ${fmtTime(row.endTime)}`
                          : "Off"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Upcoming appointments */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-text">Upcoming Appointments</h3>
                {data.upcoming.length === 0 ? (
                  <div className="mt-3 flex flex-col items-center rounded-control border border-dashed border-border px-5 py-8 text-center">
                    <CalendarX size={28} className="text-text-muted" />
                    <p className="mt-3 text-sm text-text-secondary">No upcoming appointments</p>
                    <p className="mt-1 text-xs text-text-muted">This dentist has no upcoming appointments.</p>
                  </div>
                ) : (
                  <div className="mt-3 overflow-hidden rounded-control border border-border">
                    <DataTable table={table} />
                  </div>
                )}
                {data.upcoming.length > 0 && (
                  <p className="mt-2 text-xs text-text-muted">Showing the {data.upcoming.length} next appointments.</p>
                )}
              </div>
            </>
          ) : null}
        </SheetBody>
        <SheetFooter>
          <SheetClose asChild><Button variant="outline">Close</Button></SheetClose>
          {dentist && (
            <Button asChild variant="primary">
              <Link href={`/admin/dentists/${dentist.id}`} onClick={onClose}>
                <CalendarClock aria-hidden="true" />Manage Schedule
              </Link>
            </Button>
          )}
        </SheetFooter>
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
    <div className="min-w-0">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className={cn("mt-1 break-words text-lg font-semibold tabular-nums", STAT_TONE_STYLES[tone])}>{value}</p>
      {sub && <p className="mt-1 break-words text-xs leading-relaxed text-text-muted">{sub}</p>}
    </div>
  );
}
