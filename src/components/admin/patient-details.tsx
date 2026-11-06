"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CalendarDays, CalendarX, Mail, Phone, RefreshCw, X } from "lucide-react";
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
      <SheetContent mobileBottomSheet onSwipeDismiss={onClose} showCloseButton={false} className="bg-surface" onCloseAutoFocus={(event) => {
        const trigger = returnFocusTo ? document.querySelector<HTMLElement>(returnFocusTo) : null;
        if (trigger) {
          event.preventDefault();
          trigger.focus();
        }
      }}>
        {/* Header */}
        <SheetHeader className="flex-row items-start justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex flex-col gap-1">
            <SheetTitle>Patient Details</SheetTitle>
            <SheetDescription>Contact and appointment history.</SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close patient details"><X aria-hidden="true" /></Button>
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
              <div className="flex flex-wrap items-center gap-3">
                <Avatar aria-hidden="true" className="size-12 shrink-0 rounded-control border border-border">
                  <AvatarFallback className="rounded-control bg-accent-soft text-base font-semibold text-accent">{initials(patient.firstName, patient.lastName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-base font-semibold tracking-tight text-text">
                    {patient.firstName} {patient.lastName}
                  </h3>
                </div>
                <Badge variant="secondary" className={cn(patient.status === "ACTIVE" ? "bg-success-bg text-success" : "bg-neutral-bg text-neutral-c")}>
                  {patient.status === "ACTIVE" ? "Active" : "Inactive"}
                </Badge>
              </div>

              <dl className="mt-4 divide-y divide-border border-y border-border text-sm">
                <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-3">
                  <dt className="flex items-center gap-2 text-text-muted"><Mail size={15} aria-hidden="true" />Email</dt>
                  <dd className="break-words text-text">{patient.email || "No email on file"}</dd>
                </div>
                <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-3">
                  <dt className="flex items-center gap-2 text-text-muted"><Phone size={15} aria-hidden="true" />Phone</dt>
                  <dd className="break-words text-text">{patient.phone}</dd>
                </div>
              </dl>

              {patient.notes && (
                <section className="mt-4">
                  <h3 className="text-sm font-semibold text-text">Patient notes</h3>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-secondary">{patient.notes}</p>
                </section>
              )}

              {/* Stats grid */}
              <div className="mt-4 grid grid-cols-3 divide-x divide-border rounded-control bg-surface-alt py-3">
                <StatCard label="Total" value={String(stats.total)} tone="neutral" />
                <StatCard label="Completed" value={String(stats.completed)} tone="success" />
                <StatCard label="Cancelled" value={String(stats.cancelled)} tone="error" />
              </div>
              <section className="mt-4">
                <h3 className="text-sm font-semibold text-text sm:sr-only">Appointments</h3>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-0 sm:grid-cols-2">
                  <AppointmentCard label="Next appointment" appointment={stats.nextAppointment} empty="No upcoming visits" />
                  <AppointmentCard label="Last appointment" appointment={stats.lastAppointment} empty="No past visits" />
                </div>
              </section>

              {/* Appointment history */}
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-text">Appointment History</h3>
                {data.history.length === 0 ? (
                  <div className="mt-3 flex flex-col items-center rounded-control border border-dashed border-border px-5 py-8 text-center">
                    <CalendarX size={28} className="text-text-muted" />
                    <p className="mt-3 text-sm text-text-secondary">No appointments yet</p>
                    <p className="mt-1 text-xs text-text-muted">This patient has no appointment history.</p>
                  </div>
                ) : (
                  <ul className="mt-3 divide-y divide-border rounded-control border border-border">
                    {data.history.map((appointment, index) => (
                      <li key={`${appointment.appointmentDate}-${appointment.startTime}-${index}`} className="flex items-start gap-3 p-3">
                        <CalendarDays className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden="true" />
                        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                          <div className="min-w-0 sm:border-r sm:border-border sm:pr-3">
                            <p className="break-words text-sm font-semibold text-text">{fmtDate(appointment.appointmentDate)}</p>
                            <p className="mt-1 text-xs text-text-secondary">{fmtTime(appointment.startTime)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="break-words text-sm font-semibold text-text">{appointment.service.name}</p>
                            <p className="mt-1 break-words text-xs text-text-secondary">{appointment.dentist.name}</p>
                            <div className="mt-2"><StatusBadge status={appointment.status} /></div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {data.history.length > 0 && (
                  <p className="mt-2 text-xs text-text-muted">Showing the {data.history.length} most recent appointments.</p>
                )}
              </div>
            </>
          ) : null}
        </SheetBody>
        <SheetFooter className="flex-row justify-end px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
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

function StatCard({ label, value, tone = "neutral" }: { label: string; value: string; tone?: StatTone }) {
  return (
    <div className="min-w-0 px-3">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className={cn("mt-1 break-words text-lg font-semibold tabular-nums", STAT_TONE_STYLES[tone])}>{value}</p>
    </div>
  );
}

function AppointmentCard({ label, appointment, empty }: { label: string; appointment: AppointmentRecord | null; empty: string }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-control border border-border p-3">
      <CalendarDays className="size-5 shrink-0 text-text-muted" aria-hidden="true" />
      <div className="min-w-0 border-l border-border pl-3">
        <h4 className="text-sm font-medium text-text-secondary">{label}</h4>
        <p className="mt-1 break-words text-sm font-semibold text-text">{appointment ? fmtDate(appointment.appointmentDate) : empty}</p>
        {appointment && <p className="mt-1 break-words text-xs text-text-secondary">{fmtTime(appointment.startTime)} · {appointment.service.name}</p>}
      </div>
    </div>
  );
}
