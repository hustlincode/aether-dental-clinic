"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarX, ChevronLeft, ChevronRight, Pencil, RefreshCw, Search } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { StatusBadge } from "./status-badge";
import { CancelAppointmentDialog } from "./cancel-appointment-dialog";
import { statusActionLabel } from "@/lib/status-labels";
import { toast } from "sonner";
import { DataTable, type DataTableFeatures } from "./data-table";
import { PageContainer } from "@/components/admin/page-container";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { TableSkeleton } from "@/components/admin/table-skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

interface Appt {
  id: string;
  referenceNumber: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: string;
  patient: { firstName: string; lastName: string; phone: string | null; email: string | null };
  dentist: { name: string; id: string };
  service: { name: string; id: string };
  dentistId: string;
  serviceId: string;
  notes?: string | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const ALLOWED = ["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"];
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

function getPageItems(current: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, totalPages]);
  for (let p = current - 2; p <= current + 2; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const items: (number | "...")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) items.push("...");
    items.push(p);
    prev = p;
  }
  return items;
}

const columnHelper = createColumnHelper<DataTableFeatures, Appt>();

export function AppointmentsList({ role, initialDateKey }: { role: string; initialDateKey?: string }) {
  const [query, setQuery] = useState("");
  const [params, setParams] = useState({ page: 1, status: "", search: "" });
  const [datePreset, setDatePreset] = useState<"all" | "today">(
    initialDateKey && initialDateKey === getClinicDateKey() ? "today" : "all",
  );
  const [appts, setAppts] = useState<Appt[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState<Appt | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Appt | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { page, status: statusFilter, search: searchFilter } = params;

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (statusFilter) qs.set("status", statusFilter);
    if (searchFilter) qs.set("search", searchFilter);
    if (datePreset === "today") qs.set("date", getClinicDateKey());

    fetch(`/api/appointments?${qs.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message);
        if (!cancelled) {
          setAppts(body.data?.items || []);
          setPagination(body.data?.pagination || null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load appointments.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, statusFilter, searchFilter, datePreset, refreshKey]);

  /* Loading is toggled by user actions (never synchronously inside the effect),
     so the initial state starts as true and every interaction re-shows it. */
  function beginLoad() {
    setLoading(true);
    setError("");
  }

  function handleSearchChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setParams((p) => (p.search === value ? p : { ...p, search: value, page: 1 }));
      beginLoad();
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleStatusChange(value: string) {
    setParams((p) => ({ ...p, status: value, page: 1 }));
    beginLoad();
  }

  function handleDatePresetChange(value: "all" | "today") {
    setDatePreset(value);
    setParams((p) => ({ ...p, page: 1 }));
    beginLoad();
  }

  function refresh() {
    beginLoad();
    setRefreshKey((k) => k + 1);
  }

  function goToPage(p: number) {
    if (p < 1 || (pagination && p > pagination.totalPages)) return;
    setParams((cur) => (cur.page === p ? cur : { ...cur, page: p }));
    beginLoad();
  }

  async function changeStatus(id: string, next: string, notes?: string) {
    try {
      const res = await fetch(`/api/appointments/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, ...(notes !== undefined ? { notes } : {}) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, status: next, notes: notes ?? a.notes } : a)));
      toast.success(`Appointment marked as ${next.replace("_", " ").toLowerCase()}.`);
      if (body.email && !body.email.ok) {
        toast.error("Status updated, but the notification email could not be sent. Check SMTP settings.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update the appointment.");
    }
  }

  // Append the cancellation remark (with a date stamp) to any existing notes so
  // the reason is never lost and existing clinical notes are preserved.
  function handleCancelConfirm(remarks: string) {
    if (!cancelTarget) return;
    const existing = cancelTarget.notes?.trim() || "";
    const stamp = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    const merged = remarks
      ? existing
        ? `${existing}\n[Cancelled ${stamp}] ${remarks}`
        : `[Cancelled ${stamp}] ${remarks}`
      : existing;
    changeStatus(cancelTarget.id, "CANCELLED", merged);
    setCancelTarget(null);
  }

  const columns = columnHelper.columns([
    columnHelper.accessor("referenceNumber", {
      header: "Ref",
      enableSorting: false,
      cell: (info) => (
        <span className="font-mono text-xs text-text-muted">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor((row) => `${row.patient.firstName} ${row.patient.lastName}`.trim(), {
      id: "patient",
      header: "Patient",
      cell: (info) => {
        const patient = info.row.original.patient;
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-text">
              {patient.firstName} {patient.lastName}
            </span>
            {patient.phone ? <span className="text-xs text-text-muted">{patient.phone}</span> : null}
          </div>
        );
      },
    }),
    columnHelper.accessor("appointmentDate", {
      header: "Date",
      meta: { cellClassName: "hidden md:table-cell" },
      cell: (info) => (
        <span className="text-text-secondary">{fmtDate(info.getValue())}</span>
      ),
    }),
    columnHelper.accessor("startTime", {
      header: "Time",
      enableSorting: false,
      cell: (info) => {
        const row = info.row.original;
        return (
          <span className="text-text">
            {fmtTime(row.startTime)}
            {row.endTime ? ` \u2013 ${fmtTime(row.endTime)}` : ""}
          </span>
        );
      },
    }),
    columnHelper.accessor((row) => row.service.name, {
      id: "service",
      header: "Service",
      enableSorting: false,
      meta: { cellClassName: "hidden lg:table-cell" },
      cell: (info) => (
        <span className="text-text-secondary">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor((row) => row.dentist.name, {
      id: "dentist",
      header: "Dentist",
      enableSorting: false,
      meta: { cellClassName: "hidden lg:table-cell" },
      cell: (info) => (
        <span className="text-text-secondary">{info.getValue()}</span>
      ),
    }),
    columnHelper.display({
      id: "status",
      header: "Status",
      cell: (info) => <StatusBadge status={info.row.original.status} />,
    }),
    columnHelper.display({
      id: "actions",
      header: () => <span className="block text-right">Actions</span>,
      meta: { cellClassName: "text-right" },
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setEditing(row)}
                  title="Edit appointment"
                  aria-label={`Edit appointment ${row.referenceNumber}`}
                  className="rounded-md border border-border bg-surface p-1.5 text-text-secondary transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Edit appointment</TooltipContent>
            </Tooltip>
            <StatusActions
              status={row.status}
              role={role}
              onChange={(s) => {
                if (s === "CANCELLED") setCancelTarget(row);
                else changeStatus(row.id, s);
              }}
            />
          </div>
        );
      },
    }),
  ]);

  const start = pagination && pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const end = pagination ? Math.min(pagination.page * pagination.pageSize, pagination.total) : 0;

  return (
    <>
    <PageContainer>
      <PageHeader
        eyebrow="Clinic"
        title="Appointments"
        description="Search, filter, and manage patient appointments."
        actions={
          <button
            onClick={refresh}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-text-secondary transition-all hover:border-border-accent hover:bg-accent-soft hover:text-accent"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search patient name, email, or phone..."
            className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={datePreset} onValueChange={(v) => handleDatePresetChange(v as "all" | "today")}>
            <SelectTrigger aria-label="Filter by date" className="h-9 rounded-lg border-border bg-surface px-3 text-sm text-text focus-visible:ring-accent/40">
              <SelectValue placeholder="All dates" />
            </SelectTrigger>
            <SelectContent className="bg-surface">
              <SelectItem value="all">All dates</SelectItem>
              <SelectItem value="today">Today</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter || "__all__"} onValueChange={(v) => handleStatusChange(v === "__all__" ? "" : v)}>
            <SelectTrigger aria-label="Filter by status" className="h-9 rounded-lg border-border bg-surface px-3 text-sm text-text focus-visible:ring-accent/40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent className="bg-surface">
              <SelectItem value="__all__">All statuses</SelectItem>
              {ALLOWED.map((s) => (<SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <SectionCard padded={false} bodyClassName="flex flex-col" className="animate-fade-in">
        {error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : loading && appts.length === 0 ? (
          <TableSkeleton />
        ) : appts.length === 0 ? (
          <EmptyState
            icon={CalendarX}
            title="No appointments found."
            description="Try adjusting your search, date, or status filter."
          />
        ) : (
          <>
            <div
              className={`max-h-[60vh] overflow-x-auto overflow-y-auto ${loading ? "opacity-60 transition-opacity" : ""}`}
              aria-busy={loading}
            >
              <DataTable columns={columns} data={appts} getRowId={(row) => row.id} />
            </div>

            {pagination && appts.length > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
                <p className="text-sm text-text-muted">
                  Showing {start}–{end} of {pagination.total}
                </p>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => goToPage(page - 1)}
                        disabled={page <= 1}
                        aria-label="Previous page"
                        className="rounded-lg border border-border p-1.5 text-text-secondary transition-colors hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Previous page</TooltipContent>
                  </Tooltip>
                  {getPageItems(page, pagination.totalPages).map((item, i) =>
                    item === "..." ? (
                      <span key={`ellipsis-${i}`} className="px-1.5 text-sm text-text-muted">…</span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => goToPage(item)}
                        aria-current={item === page ? "page" : undefined}
                        className={`min-w-8 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
                          item === page
                            ? "bg-accent text-primary-foreground"
                            : "text-text-secondary hover:bg-accent-soft hover:text-accent"
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => goToPage(page + 1)}
                        disabled={!pagination || page >= pagination.totalPages}
                        aria-label="Next page"
                        className="rounded-lg border border-border p-1.5 text-text-secondary transition-colors hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Next page</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            )}
          </>
        )}
      </SectionCard>
    </PageContainer>
    {editing && (
      <EditAppointmentDialog
        key={editing.id}
        appointment={editing}
        role={role}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh(); }}
      />
    )}
    <CancelAppointmentDialog
      open={cancelTarget !== null}
      patientName={cancelTarget ? `${cancelTarget.patient.firstName} ${cancelTarget.patient.lastName}` : ""}
      referenceNumber={cancelTarget?.referenceNumber ?? ""}
      onConfirm={handleCancelConfirm}
      onCancel={() => setCancelTarget(null)}
    />
    </>
  );

  function fmtTime(hhmm: string) {
    const [h, m] = hhmm.split(":").map(Number);
    const p = h >= 12 ? "PM" : "AM";
    const hr = h % 12 === 0 ? 12 : h % 12;
    return `${hr}:${String(m).padStart(2, "0")} ${p}`;
  }
  function fmtDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
}

function StatusActions({ status, role, onChange }: { status: string; role: string; onChange: (s: string) => void }) {
  const next: Record<string, string[]> = {
    PENDING: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["CHECKED_IN", "CANCELLED"],
    CHECKED_IN: ["COMPLETED", "NO_SHOW"],
    COMPLETED: [],
    CANCELLED: [],
    NO_SHOW: [],
  };

  const actions = (next[status] || []).slice(0, role === "DENTIST" ? 1 : 2);

  if (actions.length === 0) return <span className="text-xs text-text-muted">—</span>;

  return (
    <div className="flex justify-end gap-1.5">
      {actions.map((a, i) => {
        const isCancel = a === "CANCELLED";
        const isPrimary = i === 0 && !isCancel;
        return (
          <button
            key={a}
            onClick={() => onChange(a)}
            className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-all ${
              isCancel
                ? "border-destructive/30 bg-destructive text-white hover:bg-destructive/90"
                : isPrimary
                  ? "border-accent bg-accent text-primary-foreground hover:bg-accent-hover"
                  : "border-border bg-accent-soft text-accent hover:bg-accent hover:text-primary-foreground"
            }`}
          >
            {statusActionLabel(a)}
          </button>
        );
      })}
    </div>
  );
}

interface SelectOption {
  id: string;
  name: string;
  status: string;
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Clinic-local "today" in Asia/Manila as a YYYY-MM-DD key, matching the
// @db.Date keys served by /api/appointments. Client mirror of
// src/lib/clinic-time.ts clinicDateKey; kept here so the server env-dependent
// module stays out of the client bundle.
const CLINIC_TZ = "Asia/Manila";

function getClinicDateKey(instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function EditAppointmentDialog({
  appointment,
  role,
  onClose,
  onSaved,
}: {
  appointment: Appt;
  role: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const canEditPatient = role !== "DENTIST";

  const [firstName, setFirstName] = useState(appointment.patient.firstName);
  const [lastName, setLastName] = useState(appointment.patient.lastName);
  const [email, setEmail] = useState(appointment.patient.email || "");
  const [phone, setPhone] = useState(appointment.patient.phone || "");
  const [notes, setNotes] = useState(appointment.notes || "");
  const [serviceId, setServiceId] = useState(appointment.serviceId);
  const [dentistId, setDentistId] = useState(appointment.dentistId);
  const [date, setDate] = useState(appointment.appointmentDate.slice(0, 10));
  const [time, setTime] = useState(appointment.startTime);

  const [services, setServices] = useState<SelectOption[]>([]);
  const [dentists, setDentists] = useState<SelectOption[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Initial selection, used to decide whether the user actively changed the
  // date/service/dentist (in which case we auto-pick the first free slot).
  const initialKeyRef = useRef(
    `${appointment.appointmentDate.slice(0, 10)}|${appointment.serviceId}|${appointment.dentistId}`
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/services?all=true").then(async (r) => ({ ok: r.ok, body: await r.json() })),
      fetch("/api/dentists?all=true").then(async (r) => ({ ok: r.ok, body: await r.json() })),
    ])
      .then(([svc, dent]) => {
        if (cancelled) return;
        if (svc.ok && Array.isArray(svc.body?.data)) setServices(svc.body.data);
        if (dent.ok && Array.isArray(dent.body?.data)) setDentists(dent.body.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!dentistId || !serviceId || !date) return;
    let cancelled = false;
    // Same deferred-setState pattern as the booking page: the loading flag is
    // flipped inside a timer so we never set state synchronously in the effect.
    const timer = setTimeout(() => setLoadingSlots(true), 0);
    const qs = new URLSearchParams({ dentistId, serviceId, date, excludeAppointmentId: appointment.id });
    fetch(`/api/availability/slots?${qs.toString()}`)
      .then(async (res) => ({ ok: res.ok, body: await res.json() }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        const list: string[] = ok && Array.isArray(body?.data) ? body.data.map((s: { start: string }) => s.start) : [];
        setSlots(list);
        if (`${date}|${serviceId}|${dentistId}` !== initialKeyRef.current) {
          // User picked a new date/service/dentist: jump to the first free slot.
          setTime(list[0] || "");
        }
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) {
          clearTimeout(timer);
          setLoadingSlots(false);
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dentistId, serviceId, date, appointment.id]);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      if (!time) {
        setError("Please select a time.");
        return;
      }
      if (!serviceId || !dentistId || !date) {
        setError("Please fill in the dentist, service, and date.");
        return;
      }
      const payload: Record<string, unknown> = {
        appointmentDate: date,
        startTime: time,
        serviceId,
        dentistId,
        notes: notes.trim() || null,
        ...(canEditPatient
          ? {
              patient: {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                email: email.trim(),
                phone: phone.trim(),
              },
            }
          : {}),
      };
      const res = await fetch(`/api/appointments/${appointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "Unable to update the appointment.");
      toast.success("Appointment updated.");
      if (body.email && !body.email.ok) {
        toast.error("Appointment updated, but the notification email could not be sent. Check SMTP settings.");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update the appointment.");
    } finally {
      setSaving(false);
    }
  }

  const minDate = localDateKey(new Date());

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit appointment</DialogTitle>
          <DialogDescription>
            {appointment.referenceNumber} · {appointment.patient.firstName} {appointment.patient.lastName}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-error/20 bg-error-bg px-4 py-3 text-sm text-error">{error}</div>
        )}

        <div className="grid gap-4">
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-text-muted">Schedule</legend>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-date" className="text-sm font-medium text-text">Date</label>
              <input
                id="edit-date"
                type="date"
                min={minDate}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text">Dentist</label>
              <Select value={dentistId || undefined} onValueChange={setDentistId} disabled={!canEditPatient}>
                <SelectTrigger id="edit-dentist" aria-label="Dentist" className="h-9 rounded-lg border-border bg-surface px-3 text-sm text-text focus-visible:ring-accent/40">
                  <SelectValue placeholder="Select a dentist" />
                </SelectTrigger>
                <SelectContent className="bg-surface">
                  {dentists.length === 0 && (
                    <SelectItem value={appointment.dentist.id} className="disabled:opacity-50">{appointment.dentist.name}</SelectItem>
                  )}
                  {dentists.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}{d.status !== "ACTIVE" ? " (inactive)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text">Service</label>
              <Select value={serviceId || undefined} onValueChange={setServiceId}>
                <SelectTrigger id="edit-service" aria-label="Service" className="h-9 rounded-lg border-border bg-surface px-3 text-sm text-text focus-visible:ring-accent/40">
                  <SelectValue placeholder="Select a service" />
                </SelectTrigger>
                <SelectContent className="bg-surface">
                  {services.length === 0 && (
                    <SelectItem value={appointment.service.id} className="disabled:opacity-50">{appointment.service.name}</SelectItem>
                  )}
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}{s.status !== "ACTIVE" ? " (inactive)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text">Time</label>
              <Select value={time || undefined} onValueChange={setTime}>
                <SelectTrigger id="edit-time" aria-label="Time" className="h-9 rounded-lg border-border bg-surface px-3 text-sm text-text focus-visible:ring-accent/40">
                  <SelectValue placeholder="Select a time" />
                </SelectTrigger>
                <SelectContent className="bg-surface">
                  {slots.map((s) => (<SelectItem key={s} value={s}>{fmtTime(s)}</SelectItem>))}
                </SelectContent>
              </Select>
              {loadingSlots && <span className="text-xs text-text-muted">Checking availability...</span>}
              {!loadingSlots && slots.length === 0 && (
                <span className="text-xs text-text-muted">No available slots for this selection.</span>
              )}
            </div>
          </fieldset>

          {canEditPatient && (
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-text-muted">Patient</legend>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-first" className="text-sm font-medium text-text">First name</label>
                <input
                  id="edit-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-last" className="text-sm font-medium text-text">Last name</label>
                <input
                  id="edit-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-email" className="text-sm font-medium text-text">Email</label>
                <input
                  id="edit-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-phone" className="text-sm font-medium text-text">Phone</label>
                <input
                  id="edit-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
                />
              </div>
            </fieldset>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-notes" className="text-sm font-medium text-text">Notes</label>
            <textarea
              id="edit-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
              placeholder="Optional internal notes about this appointment..."
            />
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-accent-soft hover:text-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg border border-accent bg-accent px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function fmtTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const p = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${p}`;
}