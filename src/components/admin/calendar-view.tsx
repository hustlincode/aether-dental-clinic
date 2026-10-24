"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/admin/status-badge";
import { CancelAppointmentDialog } from "@/components/admin/cancel-appointment-dialog";
import { statusActionLabel } from "@/lib/status-labels";
import { Sheet, SheetBody, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/* ─── Status → theme-token styling (no hardcoded palette) ─── */
const STATUS_META: Record<string, { chip: string; border: string }> = {
  PENDING: { chip: "bg-warning-bg text-warning", border: "var(--warning)" },
  CONFIRMED: { chip: "bg-info-bg text-info", border: "var(--info)" },
  CHECKED_IN: { chip: "bg-accent-soft text-text", border: "var(--accent)" },
  COMPLETED: { chip: "bg-success-bg text-success", border: "var(--success)" },
  CANCELLED: { chip: "bg-error-bg text-error", border: "var(--error)" },
  NO_SHOW: { chip: "bg-neutral-bg text-neutral-c", border: "var(--neutral)" },
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

function statusMeta(s: string) {
  return STATUS_META[s] ?? STATUS_META.PENDING;
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
  const [totalEvents, setTotalEvents] = useState<number | null>(null);
  const [selectedAppt, setSelectedAppt] = useState<ApptRecord | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const viewRevision = useRef(0);
  const sheetRevision = useRef(0);

  const cancelLoad = useCallback(() => {
    activeRequest.current?.abort();
    viewRevision.current++;
  }, []);

  /* ─── Visible range = the whole current month ─── */
  const range = useMemo(() => {
    const from = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const to = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { from, to };
  }, [cursor]);

  /* ─── Load events for the visible date range ─── */
  const loadEvents = useCallback(async (from: string, to: string) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const revision = viewRevision.current;
    const isCurrent = () => !controller.signal.aborted && activeRequest.current === controller && viewRevision.current === revision;
    setLoading(true);
    setError("");
    setEvents([]);
    setTotalEvents(null);
    const loaded = new Map<string, ApptRecord>();
    try {
      let page = 1;
      let totalPages = 1;
      let total = 0;
      do {
        const qs = new URLSearchParams({ view: "calendar", from, to, page: String(page), pageSize: "200" });
        const res = await fetch(`/api/appointments?${qs.toString()}`, { cache: "no-store", signal: controller.signal });
        const body = await res.json();
        if (!isCurrent()) return;
        if (!res.ok) throw new Error(body.message || "Unable to load calendar events.");
        const pagination = body.data?.pagination;
        if (!Array.isArray(body.data?.items) || !Number.isInteger(pagination?.total) || pagination.total < 0 || !Number.isInteger(pagination.totalPages) || pagination.totalPages < 0) {
          throw new Error("Unable to load calendar events.");
        }
        total = pagination.total;
        totalPages = pagination.totalPages;
        for (const appointment of body.data.items as ApptRecord[]) loaded.set(appointment.id, appointment);
        setEvents([...loaded.values()]);
        setTotalEvents(total);
        if (body.data.items.length === 0 && page < totalPages) throw new Error("Appointments changed while loading. Please retry.");
        page++;
      } while (page <= totalPages);
      if (loaded.size !== total) throw new Error("Appointments changed while loading. Please retry.");
    } catch (e) {
      if (isCurrent()) setError(e instanceof Error ? e.message : "Unable to load calendar events.");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadEvents(range.from, range.to);
    }, 0);
    return () => {
      clearTimeout(timer);
      cancelLoad();
    };
  }, [range, loadEvents, cancelLoad]);

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
      list.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
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

  function changeMonth(y: number, m: number) {
    cancelLoad();
    sheetRevision.current++;
    setEvents([]);
    setTotalEvents(null);
    setLoading(true);
    setError("");
    setSelectedDate("");
    setSheetOpen(false);
    setSelectedAppt(null);
    setCursor({ y, m });
  }

  const shiftMonth = (delta: number) => {
    const next = new Date(cursor.y, cursor.m + delta, 1);
    changeMonth(next.getFullYear(), next.getMonth());
  };

  const goToday = () => {
    const d = new Date();
    if (cursor.y !== d.getFullYear() || cursor.m !== d.getMonth()) changeMonth(d.getFullYear(), d.getMonth());
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

    const revision = viewRevision.current;
    const openedSheet = sheetRevision.current;
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

      // A completed update must not restart loading a month the user left.
      if (viewRevision.current === revision) void loadEvents(range.from, range.to);
      if (viewRevision.current === revision && sheetRevision.current === openedSheet) {
        sheetRevision.current++;
        setSheetOpen(false);
        setSelectedAppt(null);
      }
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

  /* ─── Arrow-key navigation across the month grid ─── */
  const handleGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const deltas: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const delta = deltas[e.key];
    if (!delta) return;

    const target = (e.target as HTMLElement).closest("button[data-daycell]");
    if (!target) return;

    const cells = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-daycell]"),
    );
    const index = cells.indexOf(target as HTMLButtonElement);
    if (index === -1) return;

    e.preventDefault();
    const next = cells[Math.min(Math.max(index + delta, 0), cells.length - 1)];
    next?.focus();
  };

  return (
    <>
      {/* ─── Calendar ─── */}
      <div className="card-surface relative p-4">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Calendar incomplete</AlertTitle>
            <AlertDescription>
              <p>{error}</p>
              <Button
                onClick={() => loadEvents(range.from, range.to)}
                variant="outline"
                size="sm"
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center rounded-control border border-border bg-background-alt">
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Hand-rolled, not <Button>: the segmented control needs
                    `rounded-l-control` with square inner corners, and the
                    primitive's `rounded-control` base is not overridable
                    through tailwind-merge (`rounded-none` will not evict
                    `rounded-control`). Shrinking the box by 4px is the point;
                    the hit contract is applied directly. */}
                <button
                  onClick={() => shiftMonth(-1)}
                  aria-label="Previous month"
                  className="relative flex size-9 items-center justify-center rounded-l-control text-text-secondary transition-colors hover:bg-accent-soft hover:text-accent after:absolute after:left-0 after:right-0 after:-inset-y-1 after:content-['']"
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
                  className="relative flex size-9 items-center justify-center rounded-r-control text-text-secondary transition-colors hover:bg-accent-soft hover:text-accent after:absolute after:left-0 after:right-0 after:-inset-y-1 after:content-['']"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Next month</TooltipContent>
            </Tooltip>
          </div>
          <Button variant="outline" size="default" onClick={goToday}>
            Today
          </Button>
        </div>

        <p role="status" aria-atomic="true" className="mt-3 text-sm text-text-muted">
          {loading
            ? totalEvents === null ? "Loading calendar appointments..." : `Loaded ${events.length} of ${totalEvents} appointments. Loading more...`
            : error ? `${events.length} appointments loaded. Calendar is incomplete.` : `${events.length} appointments loaded.`}
        </p>

        {/* Weekday header */}
        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-text-muted">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div
          className={cn(
            "grid grid-cols-7 gap-1",
            loading && events.length > 0 && "opacity-60 transition-opacity",
          )}
          onKeyDown={handleGridKeyDown}
          aria-busy={loading}
        >
          {loading && events.length === 0
            ? Array.from({ length: grid.total }).map((_, i) => (
                <Skeleton key={i} className="min-h-14 rounded-control sm:min-h-24" />
              ))
            : Array.from({ length: grid.total }).map((_, i) => {
                const day = i - grid.offset + 1;
                if (day < 1 || day > grid.daysInMonth) {
                  return <div key={i} className="min-h-14 rounded-control bg-background-alt/40 sm:min-h-24" />;
                }
                const key = dayKey(day);
                const items = byDate.get(key) ?? [];
                const isToday = key === todayKey;
                const isSelected = key === selectedDate;

                return (
                  <button
                    key={i}
                    type="button"
                    data-daycell
                    onClick={() => items.length > 0 && setSelectedDate(isSelected ? "" : key)}
                    aria-label={`${fmtLongDate(key)}${items.length > 0 ? `, ${items.length} appointments` : ""}`}
                    className={cn(
                      "flex min-h-14 flex-col items-stretch gap-1 rounded-control border p-1 text-left transition-colors sm:min-h-24 sm:p-1.5",
                      isSelected
                        ? "border-border-accent bg-accent-soft/70"
                        : "border-border bg-background-alt/40 hover:border-border-accent hover:bg-accent-soft/30",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-pill text-xs font-semibold sm:h-7 sm:w-7",
                        isToday ? "bg-accent-fill text-primary-foreground" : "text-text-secondary",
                      )}
                    >
                      {day}
                    </span>

                    {/* Chips (sm+) */}
                    {items.length > 0 && (
                      <div className="hidden flex-col gap-1 sm:flex">
                        {items.slice(0, MAX_CHIPS).map((a) => {
                          const meta = statusMeta(a.status);
                          return (
                            <span
                              key={a.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                sheetRevision.current++;
                                openSheet(a);
                              }}
                              className={cn(
                                "flex cursor-pointer items-center gap-1 truncate rounded border-l-[3px] px-1.5 py-0.5 text-micro font-medium transition-colors hover:brightness-105",
                                meta.chip,
                              )}
                              style={{ borderLeftColor: meta.border }}
                            >
                              <span className="truncate">
                                {a.patient.firstName} {a.patient.lastName}
                              </span>
                            </span>
                          );
                        })}
                        {items.length > MAX_CHIPS && (
                          <span className="px-1.5 text-eyebrow font-medium text-text-muted">
                            +{items.length - MAX_CHIPS} more
                          </span>
                        )}
                      </div>
                    )}

                    {/* Dot indicator (mobile) */}
                    {items.length > 0 && (
                      <span className="mt-auto flex justify-center pb-0.5 sm:hidden" aria-hidden>
                        <span className="h-1.5 w-1.5 rounded-pill bg-accent-fill" />
                      </span>
                    )}
                  </button>
                );
              })}
        </div>
      </div>

      {/* ─── Day agenda ─── */}
      {selectedItems.length > 0 && (
        <div className="card-surface mt-4 animate-fade-in p-4">
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
                  onClick={() => { sheetRevision.current++; openSheet(a); }}
                  className="flex w-full items-center gap-3 rounded-control px-2 py-2.5 text-left transition-colors hover:bg-accent-soft"
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
      <Sheet open={sheetOpen} onOpenChange={(open) => { setSheetOpen(open); if (!open) sheetRevision.current++; }}>
        <SheetContent side="right" className="w-full bg-surface sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Appointment Details</SheetTitle>
            <SheetDescription>
              {patient ? `${patient.firstName} ${patient.lastName}` : "Loading..."}
            </SheetDescription>
          </SheetHeader>

          {selectedAppt && (
            <SheetBody className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-text">Appointment overview</h3>
                <StatusBadge status={currentStatus} />
              </div>

              {/* Patient info */}
              <dl className="flex flex-col gap-4">
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
              </dl>
            </SheetBody>
          )}

          <SheetFooter>
            {nextActions.length > 0 && (
              <div className="flex w-full flex-wrap gap-3">
                {nextActions.map((ns) => (
                  <Button
                    key={ns}
                    onClick={() => (ns === "CANCELLED" ? setCancelOpen(true) : changeStatus(ns))}
                    disabled={actionLoading}
                    variant={ns === "CANCELLED" ? "destructive" : "primary"}
                    className="min-w-28 flex-1"
                  >
                    {actionLoading ? "Updating..." : statusActionLabel(ns)}
                  </Button>
                ))}
              </div>
            )}
            <SheetClose asChild>
              <Button variant="outline" type="button">Close</Button>
            </SheetClose>
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
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-baseline gap-4 text-sm">
      <dt className="text-text-muted">{label}</dt>
      <dd className={cn("min-w-0 whitespace-pre-wrap text-text", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}
