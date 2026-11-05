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
      <SheetContent mobileBottomSheet onSwipeDismiss={onClose} showCloseButton={false} className="bg-surface" onCloseAutoFocus={(event) => {
        const trigger = returnFocusTo ? document.querySelector<HTMLElement>(returnFocusTo) : null;
        if (trigger) {
          event.preventDefault();
          trigger.focus();
        }
      }}>
        {/* Header */}
        <SheetHeader className="flex-row items-start justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <SheetTitle>Dentist Details</SheetTitle>
            <SheetDescription>Profile and availability.</SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close dentist details"><X aria-hidden="true" /></Button>
          </SheetClose>
        </SheetHeader>

        {/* Body */}
        <SheetBody className="px-4 py-4 sm:px-5">
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
              <div className="flex flex-wrap items-center gap-3">
                <Avatar className="size-10 shrink-0 rounded-control border border-border">
                  <AvatarImage src={dentist.profileImage || undefined} alt={dentist.name} />
                  <AvatarFallback className="rounded-control bg-accent-soft text-base font-semibold text-accent">
                    {initials(dentist.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  <h3 className="break-words text-base font-semibold tracking-tight text-text">{dentist.name}</h3>
                  <p className="break-words text-sm text-text-secondary">{dentist.specialization}</p>
                </div>
                <Badge variant="secondary" className={cn(dentist.status === "ACTIVE" ? "bg-success-bg text-success" : "bg-neutral-bg text-neutral-c")}>
                  {dentist.status === "ACTIVE" ? "Active" : "Inactive"}
                </Badge>
              </div>

              <dl className="mt-4 flex flex-col gap-2 text-sm">
                <div>
                  <dt className="sr-only">Email</dt>
                  <dd className="flex min-w-0 items-start gap-2 text-text"><Mail className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden="true" /><span className="min-w-0 break-words">{dentist.email}</span></dd>
                </div>
                {dentist.phone && (
                  <div>
                    <dt className="sr-only">Phone</dt>
                    <dd className="flex min-w-0 items-start gap-2 text-text"><Phone className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden="true" /><span className="min-w-0 break-words">{dentist.phone}</span></dd>
                  </div>
                )}
              </dl>

              {/* Stats grid */}
              <div className="mt-4 grid grid-cols-2 divide-x divide-border rounded-control bg-surface-alt py-3">
                <StatCard label="Total Appointments" value={String(stats.totalAppointments)} tone="neutral" />
                <StatCard label="Upcoming" value={String(stats.upcomingCount)} tone="accent" />
              </div>

              {/* Weekly schedule */}
              <div className="mt-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-text"><CalendarClock className="size-4 shrink-0" aria-hidden="true" />Weekly Schedule</h3>
                <dl className="mt-2 divide-y divide-border">
                  {schedule.map((row, index) => (
                    <div
                      key={DAY_ORDER[index]}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm"
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
              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-text"><CalendarClock className="size-4 shrink-0" aria-hidden="true" />Upcoming Appointments</h3>
                  <Badge variant="secondary">{stats.upcomingCount}</Badge>
                </div>
                {data.upcoming.length === 0 ? (
                  <div className="mt-3 flex items-center gap-3 rounded-control bg-surface-alt p-3">
                    <CalendarX className="size-5 shrink-0 text-text-muted" aria-hidden="true" />
                    <p className="text-sm text-text-secondary">No upcoming appointments</p>
                  </div>
                ) : (
                  <div data-slot="dentist-appointments" className="mt-3 overflow-x-auto rounded-control border border-border">
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
        <SheetFooter className="flex-row flex-wrap gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          <SheetClose asChild><Button variant="outline" className="min-w-max flex-1">Close</Button></SheetClose>
          {dentist && (
            <Button asChild variant="primary" className="min-w-max flex-1">
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
    <div className="min-w-0 px-3">
      <p className={cn("break-words text-lg font-semibold tabular-nums", STAT_TONE_STYLES[tone])}>{value}</p>
      <p className="mt-1 text-xs font-medium text-text-muted">{label}</p>
      {sub && <p className="mt-1 break-words text-xs leading-relaxed text-text-muted">{sub}</p>}
    </div>
  );
}
