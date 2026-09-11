"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/admin/status-badge";
import { CancelAppointmentDialog } from "@/components/admin/cancel-appointment-dialog";
import { statusActionLabel } from "@/lib/status-labels";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

/* ─── Status → color mapping (matches the ProSmile palette) ─── */
const STATUS_COLORS: Record<string, string> = {
  PENDING: "#d97706",
  CONFIRMED: "#2563eb",
  CHECKED_IN: "#D4AF37",
  COMPLETED: "#16a34a",
  CANCELLED: "#dc2626",
  NO_SHOW: "#6b7280",
};

/* ─── Allowed next-status transitions per current status ─── */
const allowedNext: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS = 3;

function statusLabel(s: string) {
  return s
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusColor(s: string) {
  return STATUS_COLORS[s] ?? STATUS_COLORS.PENDING;
}

/* ─── Shape stored in the fetched appointment list ─── */
interface ApptRecord {
  id: string;
  referenceNumber: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: string;
  notes: string | null;
  patient: { firstName: string; lastName: string; phone: string | null };
  dentist: { name: string };
  service: { name: string };
}

function fmtTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const p = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${p}`;
}

function fmtLongDate(iso: string) {
  const datePart = iso.slice(0, 10);
  const d = new Date(`${datePart}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

/* ─── CalendarView ─── */
export function CalendarView() {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [cursor, setCursor] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<ApptRecord[]>([]);
  const [selectedAppt, setSelectedAppt] = useState<ApptRecord | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  /* ─── Visible range = the whole current month ─── */
  const range = useMemo(() => {
    const from = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const to = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { from, to };
  }, [cursor]);

  /* ─── Load events for the visible date range ─── */
  const loadEvents = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ from, to, pageSize: "500" });
      const res = await fetch(`/api/appointments?${qs.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      setEvents(body.data?.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load calendar events.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadEvents(range.from, range.to);
    }, 0);
    return () => clearTimeout(timer);
  }, [range, loadEvents]);

  /* ─── Group events by local date key ─── */
  const byDate = useMemo(() => {
    const map = new Map<string, ApptRecord[]>();
    for (const appt of events) {
      const key = String(appt.appointmentDate).slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(appt);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [events]);

  /* ─── Month grid geometry ─── */
  const grid = useMemo(() => {
    const offset = new Date(cursor.y, cursor.m, 1).getDay();
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const total = Math.ceil((offset + daysInMonth) / 7) * 7;
    return { offset, daysInMonth, total };
  }, [cursor]);

  const dayKey = (d: number) => `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const monthLabel = useMemo(
    () => new Date(cursor.y, cursor.m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    [cursor],
  );

  const shiftMonth = (delta: number) =>
    setCursor((c) => {
      const n = new Date(c.y, c.m + delta, 1);
      return { y: n.getFullYear(), m: n.getMonth() };
    });

  const goToday = () => {
    const d = new Date();
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setSelectedDate(todayKey);
  };

  /* ─── Event click → open Sheet ─── */
  const openSheet = useCallback((appt: ApptRecord) => {
    setSelectedAppt(appt);
    setSheetOpen(true);
  }, []);

  /* ─── Quick status change ─── */
  async function changeStatus(nextStatus: string, notes?: string) {
    if (!selectedAppt) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/appointments/${selectedAppt.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, ...(notes !== undefined ? { notes } : {}) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);

      toast.success(`Appointment marked as ${statusLabel(nextStatus)}.`);
      if (body.email && !body.email.ok) {
        toast.error("Status updated, but the notification email could not be sent. Check SMTP settings.");
      }

      // Refetch the current month to reflect the updated status color
      await loadEvents(range.from, range.to);
      setSheetOpen(false);
      setSelectedAppt(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update the appointment.");
    } finally {
      setActionLoading(false);
    }
  }

  /* ─── Confirm cancellation from the dialog, appending the remark to notes ─── */
  function handleCancelConfirm(remarks: string) {
    if (!selectedAppt) return;
    const existing = selectedAppt.notes?.trim() || "";
    const stamp = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    const merged = remarks
      ? existing
        ? `${existing}\n[Cancelled ${stamp}] ${remarks}`
        : `[Cancelled ${stamp}] ${remarks}`
      : existing;
    changeStatus("CANCELLED", merged);
    setCancelOpen(false);
  }

  /* ─── Derived data for the Sheet ─── */
  const patient = selectedAppt?.patient;
  const service = selectedAppt?.service;
  const dentist = selectedAppt?.dentist;
  const currentStatus = selectedAppt?.status ?? "";
  const nextActions = (allowedNext[currentStatus] ?? []).slice(0, 2);

  const selectedItems = selectedDate ? (byDate.get(selectedDate) ?? []) : [];

  return (
    <>
      {/* ─── Calendar ─── */}
      <div className="relative rounded-xl border border-border bg-surface p-4 shadow">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-surface/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
              <span className="text-sm text-text-muted">Loading calendar...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-error/20 bg-error-bg px-4 py-3 text-sm text-error">
            <div className="flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={() => loadEvents(range.from, range.to)}
                className="ml-4 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-all hover:border-border-accent hover:bg-accent-soft hover:text-accent"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center rounded-lg border border-border bg-background-alt">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => shiftMonth(-1)}
                  aria-label="Previous month"
                  className="flex h-8 w-8 items-center justify-center rounded-l-lg text-text-secondary transition-colors hover:bg-accent-soft hover:text-accent"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Previous month</TooltipContent>
            </Tooltip>
            <span className="min-w-36 text-center text-sm font-semibold text-text">{monthLabel}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => shiftMonth(1)}
                  aria-label="Next month"
                  className="flex h-8 w-8 items-center justify-center rounded-r-lg text-text-secondary transition-colors hover:bg-accent-soft hover:text-accent"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Next month</TooltipContent>
            </Tooltip>
          </div>
          <button
            onClick={goToday}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-all hover:border-border-accent hover:bg-accent-soft hover:text-accent"
          >
            Today
          </button>
        </div>

        {/* Weekday header */}
        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-text-muted">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: grid.total }).map((_, i) => {
            const day = i - grid.offset + 1;
            if (day < 1 || day > grid.daysInMonth) {
              return <div key={i} className="min-h-14 rounded-lg bg-background-alt/40 sm:min-h-24" />;
            }
            const key = dayKey(day);
            const items = byDate.get(key) ?? [];
            const isToday = key === todayKey;
            const isSelected = key === selectedDate;

            return (
              <button
                key={i}
                type="button"
                onClick={() => items.length > 0 && setSelectedDate(isSelected ? "" : key)}
                aria-label={`${fmtLongDate(key)}${items.length > 0 ? `, ${items.length} appointments` : ""}`}
                className={cn(
                  "flex min-h-14 flex-col items-stretch gap-1 rounded-lg border p-1 text-left transition-colors sm:min-h-24 sm:p-1.5",
                  isSelected
                    ? "border-border-accent bg-accent-soft/70"
                    : "border-border bg-background-alt/40 hover:border-border-accent hover:bg-accent-soft/30",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold sm:h-7 sm:w-7",
                    isToday ? "bg-accent text-[#0E0F10]" : "text-text-secondary",
                  )}
                >
                  {day}
                </span>

                {/* Chips (sm+) */}
                {items.length > 0 && (
                  <div className="hidden flex-col gap-1 sm:flex">
                    {items.slice(0, MAX_CHIPS).map((a) => {
                      const color = statusColor(a.status);
                      return (
                        <span
                          key={a.id}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            openSheet(a);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              openSheet(a);
                            }
                          }}
                          className="flex cursor-pointer items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] font-medium text-text-secondary transition-colors hover:text-accent"
                          style={{
                            backgroundColor: `${color}1A`,
                            borderLeft: `3px solid ${color}`,
                          }}
                        >
                          <span className="truncate">
                            {a.patient.firstName} {a.patient.lastName}
                          </span>
                        </span>
                      );
                    })}
                    {items.length > MAX_CHIPS && (
                      <span className="px-1.5 text-[11px] font-medium text-text-muted">
                        +{items.length - MAX_CHIPS} more
                      </span>
                    )}
                  </div>
                )}

                {/* Dot indicator (mobile) */}
                {items.length > 0 && (
                  <span className="mt-auto flex justify-center pb-0.5 sm:hidden" aria-hidden>
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Day agenda ─── */}
      {selectedItems.length > 0 && (
        <div className="mt-4 animate-fade-in rounded-xl border border-border bg-surface p-4 shadow">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text">{fmtLongDate(selectedDate)}</h3>
            <span className="text-xs text-text-muted">
              {selectedItems.length} appointment{selectedItems.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {selectedItems.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => openSheet(a)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-accent-soft"
                >
                  <span className="w-16 shrink-0 text-sm font-semibold text-text">{fmtTime(a.startTime)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">
                      {a.patient.firstName} {a.patient.lastName}
                    </span>
                    <span className="block truncate text-xs text-text-muted">
                      {a.service.name} · {a.dentist.name}
                    </span>
                  </span>
                  <StatusBadge status={a.status} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ─── Event Detail Sheet ─── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Appointment Details</SheetTitle>
            <SheetDescription>
              {patient ? `${patient.firstName} ${patient.lastName}` : "Loading..."}
            </SheetDescription>
          </SheetHeader>

          {selectedAppt && (
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
              <Separator />

              {/* Patient info */}
              <div className="space-y-1.5">
                <DetailRow label="Patient" value={`${patient?.firstName} ${patient?.lastName}`} />
                {patient?.phone && <DetailRow label="Phone" value={patient.phone} />}
                <DetailRow label="Service" value={service?.name ?? "—"} />
                <DetailRow label="Dentist" value={dentist?.name ?? "—"} />
                <DetailRow label="Date" value={fmtLongDate(selectedAppt.appointmentDate)} />
                <DetailRow
                  label="Time"
                  value={`${fmtTime(selectedAppt.startTime)} – ${fmtTime(selectedAppt.endTime)}`}
                />
                <DetailRow label="Reference" value={selectedAppt.referenceNumber} mono />
                {selectedAppt.notes && (
                  <DetailRow label="Notes" value={selectedAppt.notes} />
                )}
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-text-muted">Status</span>
                <div>
                  <StatusBadge status={currentStatus} />
                </div>
              </div>
            </div>
          )}

          <SheetFooter>
            {nextActions.length > 0 && (
              <div className="flex w-full gap-2">
                {nextActions.map((ns) => (
                  <Button
                    key={ns}
                    onClick={() => (ns === "CANCELLED" ? setCancelOpen(true) : changeStatus(ns))}
                    disabled={actionLoading}
                    variant={ns === "CANCELLED" ? "destructive" : "default"}
                    className={cn(
                      "flex-1",
                      ns !== "CANCELLED" && "bg-accent text-[#0E0F10] hover:bg-accent-hover",
                    )}
                  >
                    {actionLoading ? "Updating..." : statusActionLabel(ns)}
                  </Button>
                ))}
              </div>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ─── Confirm cancellation (with remarks) ─── */}
      <CancelAppointmentDialog
        open={cancelOpen}
        patientName={
          selectedAppt ? `${selectedAppt.patient.firstName} ${selectedAppt.patient.lastName}` : ""
        }
        referenceNumber={selectedAppt?.referenceNumber ?? ""}
        loading={actionLoading}
        onConfirm={handleCancelConfirm}
        onCancel={() => setCancelOpen(false)}
      />
    </>
  );
}

/* ─── Small helper row ─── */
function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</span>
      <span className={cn("text-right text-sm text-text", mono && "font-mono text-xs")}>{value}</span>
    </div>
  );
}