"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CalendarX, RefreshCw, X } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, useDataTable, type FilterableDataTableFeatures } from "./data-table";
import { StatusBadge } from "./status-badge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  followUpEnabled?: boolean;
  followUpDays?: number;
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
  onClose,
}: {
  open: boolean;
  patientId: string | null;
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

  // Fetch patient details whenever the drawer opens. Loading starts as true via
  // remount (parent keys this component by patient id), so no synchronous
  // setState is needed inside the effect body.
  useEffect(() => {
    if (!open || !patientId) return;
    let cancelled = false;

    fetch(`/api/patients/${patientId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message);
        if (!cancelled) setData(body.data);
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
      <SheetContent side="right" showCloseButton={false} className="w-full max-w-md gap-0 border-l border-border-strong bg-surface p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <SheetTitle className="text-lg font-bold text-text">Patient Details</SheetTitle>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface-alt hover:text-text"
                aria-label="Close patient details"
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
              <h3 className="mt-4 text-base font-semibold text-text">Unable to load patient</h3>
              <p className="mt-1 max-w-sm text-sm text-text-muted">{error}</p>
              <button
                onClick={retry}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition hover:border-border-accent hover:bg-accent-soft hover:text-accent"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </button>
            </div>
          ) : data && patient && stats ? (
            <>
              {/* Patient header */}
              <div className="flex items-center gap-3">
                <div className="gradient-gold flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-primary-foreground">
                  {initials(patient.firstName, patient.lastName)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-text">
                    {patient.firstName} {patient.lastName}
                  </p>
                  <p className="truncate text-sm text-text-secondary">{patient.email || "No email on file"}</p>
                  <p className="text-sm text-text-muted">{patient.phone}</p>
                </div>
                <span
                  className={`ml-auto shrink-0 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    patient.status === "ACTIVE" ? "bg-success-bg text-success" : "bg-neutral-bg text-neutral-c"
                  }`}
                >
                  {patient.status === "ACTIVE" ? "Active" : "Inactive"}
                </span>
              </div>

              {patient.notes && (
                <p className="mt-3 rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text-secondary">
                  {patient.notes}
                </p>
              )}

              {/* Stats grid */}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <StatCard label="Total" value={String(stats.total)} tone="neutral" />
                <StatCard label="Completed" value={String(stats.completed)} tone="success" />
                <StatCard label="Cancelled" value={String(stats.cancelled)} tone="error" />
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
                <StatCard
                  label="Follow-up Email"
                  value={patient.followUpEnabled === false ? "Off" : "On"}
                  sub={
                    patient.followUpEnabled === false
                      ? "Will not be contacted"
                      : `${patient.followUpDays ?? 1} day${(patient.followUpDays ?? 1) === 1 ? "" : "s"} after each visit`
                  }
                  tone={patient.followUpEnabled === false ? "neutral" : "success"}
                />
              </div>

              {/* Appointment history */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-text">Appointment History</h3>
                {data.history.length === 0 ? (
                  <div className="mt-3 flex flex-col items-center rounded-xl border border-border bg-surface-alt px-6 py-10 text-center">
                    <CalendarX size={28} className="text-text-muted" />
                    <p className="mt-3 text-sm text-text-secondary">No appointments yet</p>
                    <p className="mt-1 text-xs text-text-muted">This patient has no appointment history.</p>
                  </div>
                ) : (
                  <div className="card-surface mt-3 overflow-hidden">
                    <DataTable table={table} />
                  </div>
                )}
                {data.history.length > 0 && (
                  <p className="mt-2 text-xs text-text-muted">Showing the {data.history.length} most recent appointments.</p>
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