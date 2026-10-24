"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CalendarX, Mail, Phone, RefreshCw, X } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, useDataTable, type FilterableDataTableFeatures } from "./data-table";
import { StatusBadge } from "./status-badge";
import { Sheet, SheetBody, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import type { StatTone } from "@/components/admin/stat-card";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AppointmentRecord {
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: string;
  service: { name: string };
  dentist: { name: string };
}

interface PatientStats {
  total: number;
  completed: number;
  cancelled: number;
  nextAppointment: AppointmentRecord | null;
  lastAppointment: AppointmentRecord | null;
}

interface PatientDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
}

interface PatientDetailsData {
  patient: PatientDetail;
  stats: PatientStats;
  history: AppointmentRecord[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function initials(first: string, last: string): string {
  return `${(first[0] || "").toUpperCase()}${(last[0] || "").toUpperCase()}`;
}

// ─── Appointment History Columns ─────────────────────────────────────────────

const columnHelper = createColumnHelper<FilterableDataTableFeatures, AppointmentRecord>();

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
  columnHelper.accessor((a) => a.service?.name ?? "", {
    id: "service",
    header: "Service",
    meta: { cellClassName: "hidden sm:table-cell" },
    cell: (info) => <span className="text-text-secondary">{info.row.original.service.name}</span>,
  }),
  columnHelper.accessor((a) => a.dentist?.name ?? "", {
    id: "dentist",
    header: "Dentist",
    meta: { cellClassName: "hidden sm:table-cell" },
    cell: (info) => <span className="text-text-secondary">{info.row.original.dentist.name}</span>,
  }),
  columnHelper.accessor((a) => a.status, {
    id: "status",
    header: "Status",
    cell: (info) => <StatusBadge status={info.getValue()} />,
  }),
]);

// ─── Patient Details Drawer ──────────────────────────────────────────────────

export function PatientDetails({
  open,
  patientId,
  returnFocusTo,
  onClose,
}: {
  open: boolean;
  patientId: string | null;
  returnFocusTo?: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<PatientDetailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const table = useDataTable({
    columns,
    data: data?.history ?? [],
    getRowId: (row, index) => `${row.appointmentDate}-${row.startTime}-${index}`,
    options: { initialState: { pagination: { pageIndex: 0, pageSize: 100000 } } },
  });

  // Keep the last loaded profile visible while refreshing the same patient.
  useEffect(() => {
    if (!open || !patientId) return;
    let cancelled = false;

    fetch(`/api/patients/${patientId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message);
        if (!cancelled) {
          setError("");
          setData(body.data);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load patient details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, patientId, refreshKey]);

  function retry() {
    if (!patientId) return;
    setLoading(true);
    setError("");
    setRefreshKey((k) => k + 1);
  }

  if (!patientId) return null;

  const patient = data?.patient ?? null;
  const stats = data?.stats ?? null;

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
            <SheetTitle>Patient Details</SheetTitle>
            <SheetDescription>Contact information and appointment history.</SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close patient details"><X aria-hidden="true" /></Button>
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
              <h3 className="mt-4 text-base font-semibold text-text">Unable to load patient</h3>
              <p className="mt-1 max-w-sm text-sm text-text-muted">{error}</p>
              <Button onClick={retry} variant="outline" className="mt-4">
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
            </div>
          ) : data && patient && stats ? (
            <>
              {/* Patient header */}
              <div className="flex items-start gap-4">
                <Avatar aria-hidden="true" className="size-12 rounded-control border border-border">
                  <AvatarFallback className="rounded-control bg-accent-soft text-base font-semibold text-accent">{initials(patient.firstName, patient.lastName)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
                  <h3 className="break-words text-xl font-semibold tracking-tight text-text">
                    {patient.firstName} {patient.lastName}
                  </h3>
                  <Badge variant="secondary" className={cn(patient.status === "ACTIVE" ? "bg-success-bg text-success" : "bg-neutral-bg text-neutral-c")}>
                    {patient.status === "ACTIVE" ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>

              <dl className="mt-6 flex flex-col gap-4 border-y border-border py-5 text-sm">
                <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
                  <dt className="flex items-center gap-2 text-text-muted"><Mail size={15} aria-hidden="true" />Email</dt>
                  <dd className="break-words text-text">{patient.email || "No email on file"}</dd>
                </div>
                <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
                  <dt className="flex items-center gap-2 text-text-muted"><Phone size={15} aria-hidden="true" />Phone</dt>
                  <dd className="break-words text-text">{patient.phone}</dd>
                </div>
              </dl>

              {patient.notes && (
                <section className="mt-6">
                  <h3 className="text-sm font-semibold text-text">Patient notes</h3>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-secondary">{patient.notes}</p>
                </section>
              )}

              {/* Stats grid */}
              <div className="mt-6 grid grid-cols-3 gap-4 border-b border-border pb-5">
                <StatCard label="Total" value={String(stats.total)} tone="neutral" />
                <StatCard label="Completed" value={String(stats.completed)} tone="success" />
                <StatCard label="Cancelled" value={String(stats.cancelled)} tone="error" />
              </div>
              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <StatCard
                  label="Next Appointment"
                  value={stats.nextAppointment ? fmtDate(stats.nextAppointment.appointmentDate) : "—"}
                  sub={stats.nextAppointment ? `${fmtTime(stats.nextAppointment.startTime)} · ${stats.nextAppointment.service.name}` : "No upcoming visits"}
                  tone="accent"
                />
                <StatCard
                  label="Last Appointment"
                  value={stats.lastAppointment ? fmtDate(stats.lastAppointment.appointmentDate) : "—"}
                  sub={stats.lastAppointment ? `${fmtTime(stats.lastAppointment.startTime)} · ${stats.lastAppointment.service.name}` : "No past visits"}
                  tone="neutral"
                />
              </div>

              {/* Appointment history */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-text">Appointment History</h3>
                {data.history.length === 0 ? (
                  <div className="mt-3 flex flex-col items-center rounded-control border border-dashed border-border px-5 py-8 text-center">
                    <CalendarX size={28} className="text-text-muted" />
                    <p className="mt-3 text-sm text-text-secondary">No appointments yet</p>
                    <p className="mt-1 text-xs text-text-muted">This patient has no appointment history.</p>
                  </div>
                ) : (
                  <div className="mt-3 overflow-hidden rounded-control border border-border">
                    <DataTable table={table} />
                  </div>
                )}
                {data.history.length > 0 && (
                  <p className="mt-2 text-xs text-text-muted">Showing the {data.history.length} most recent appointments.</p>
                )}
              </div>
            </>
          ) : null}
        </SheetBody>
        <SheetFooter>
          <SheetClose asChild><Button variant="outline">Close</Button></SheetClose>
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
