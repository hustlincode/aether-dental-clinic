"use client";

import { useCallback, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import type { EventInput, CalendarRef, DatesSetInfo, EventClickInfo } from "@fullcalendar/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/admin/status-badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

/* ─── Status → color mapping (matches ProSmile palette) ─── */
const statusColors: Record<string, { bg: string; border: string }> = {
  PENDING: { bg: "#d97706", border: "#d97706" },
  CONFIRMED: { bg: "#2563eb", border: "#2563eb" },
  CHECKED_IN: { bg: "#D4AF37", border: "#D4AF37" },
  COMPLETED: { bg: "#16a34a", border: "#16a34a" },
  CANCELLED: { bg: "#dc2626", border: "#dc2626" },
  NO_SHOW: { bg: "#6b7280", border: "#6b7280" },
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

function statusLabel(s: string) {
  return s
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─── Shape stored in extendedProps ─── */
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

/* ─── CalendarView ─── */
export function CalendarView() {
  const calendarRef = useRef<CalendarRef>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<EventInput[]>([]);
  const [selectedAppt, setSelectedAppt] = useState<ApptRecord | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  /* ─── Helper: extract from/to for the current visible range ─── */
  function getVisibleRange() {
    const calApi = calendarRef.current?.getApi();
    if (!calApi) return null;
    const view = calApi.view;
    const from = fmtLocalDate(view.activeStart);
    const endDate = new Date(view.activeEnd);
    endDate.setDate(endDate.getDate() - 1);
    const to = fmtLocalDate(endDate);
    return { from, to };
  }

  /* ─── Load events for the visible date range ─── */
  const loadEvents = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ from: start, to: end, pageSize: "500" });
      const res = await fetch(`/api/appointments?${qs.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);

      const items: ApptRecord[] = body.data?.items ?? [];
      const mapped: EventInput[] = items.map((appt) => {
        const colors = statusColors[appt.status] ?? statusColors.PENDING;
        // appt.appointmentDate arrives as "2026-09-10T00:00:00.000Z" (Prisma @db.Date);
        // take just the YYYY-MM-DD portion for the event's local start/end.
        const datePart = String(appt.appointmentDate).slice(0, 10);

        return {
          id: appt.id,
          title: `${appt.patient.firstName} ${appt.patient.lastName} · ${appt.service.name}`,
          start: `${datePart}T${appt.startTime}:00`,
          end: `${datePart}T${appt.endTime}:00`,
          backgroundColor: colors.bg,
          borderColor: colors.border,
          extendedProps: { appointment: appt },
        };
      });
      setEvents(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load calendar events.");
    } finally {
      setLoading(false);
    }
  }, []);

  /* ─── datesSet fires when the visible range changes ─── */
  const handleDatesSet = useCallback(
    (arg: DatesSetInfo) => {
      const from = fmtLocalDate(new Date(arg.start ?? arg.startStr));
      const endDate = new Date(arg.end ?? arg.endStr);
      endDate.setDate(endDate.getDate() - 1);
      const to = fmtLocalDate(endDate);
      loadEvents(from, to);
    },
    [loadEvents],
  );

  /* ─── Event click → open Sheet ─── */
  const handleEventClick = useCallback((info: EventClickInfo) => {
    const appt = info.event?.extendedProps?.appointment as ApptRecord | undefined;
    if (appt) {
      setSelectedAppt(appt);
      setSheetOpen(true);
    }
  }, [setSelectedAppt, setSheetOpen]);

  /* ─── Quick status change ─── */
  async function changeStatus(nextStatus: string) {
    if (!selectedAppt) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/appointments/${selectedAppt.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);

      toast.success(`Appointment marked as ${statusLabel(nextStatus)}.`);
      if (body.email && !body.email.ok) {
        toast.error("Status updated, but the notification email could not be sent. Check SMTP settings.");
      }

      // Refetch events to reflect the updated status color
      const range = getVisibleRange();
      if (range) {
        await loadEvents(range.from, range.to);
      }

      setSheetOpen(false);
      setSelectedAppt(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update the appointment.");
    } finally {
      setActionLoading(false);
    }
  }

  /* ─── Derived data for the Sheet ─── */
  const patient = selectedAppt?.patient;
  const service = selectedAppt?.service;
  const dentist = selectedAppt?.dentist;
  const currentStatus = selectedAppt?.status ?? "";
  const nextActions = (allowedNext[currentStatus] ?? []).slice(0, 2);

  function fmtTime(hhmm: string) {
    const [h, m] = hhmm.split(":").map(Number);
    const p = h >= 12 ? "PM" : "AM";
    const hr = h % 12 === 0 ? 12 : h % 12;
    return `${hr}:${String(m).padStart(2, "0")} ${p}`;
  }

  function fmtDate(iso: string) {
    // appointmentDate arrives as "2026-09-10T00:00:00.000Z"; take the date part.
    const datePart = iso.slice(0, 10);
    const d = new Date(`${datePart}T00:00:00`);
    return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

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
                onClick={() => {
                  const range = getVisibleRange();
                  if (range) loadEvents(range.from, range.to);
                }}
                className="ml-4 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-all hover:border-border-accent hover:bg-accent-soft hover:text-accent"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          events={events}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
          height="auto"
          slotMinTime="08:00:00"
          slotMaxTime="19:00:00"
          slotDuration="00:30:00"
          allDaySlot={false}
          weekends
          firstDay={1}
          eventDisplay="block"
          dayMaxEvents={4}
          nowIndicator
        />
      </div>

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
                <DetailRow label="Date" value={fmtDate(selectedAppt.appointmentDate)} />
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
                    onClick={() => changeStatus(ns)}
                    disabled={actionLoading}
                    variant={ns === "CANCELLED" ? "destructive" : "default"}
                    className={cn(
                      "flex-1",
                      ns !== "CANCELLED" && "bg-accent text-[#0E0F10] hover:bg-accent-hover",
                    )}
                  >
                    {actionLoading ? "Updating..." : statusLabel(ns)}
                  </Button>
                ))}
              </div>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
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

/* ─── Format a Date as YYYY-MM-DD in the local timezone ─── */
function fmtLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
