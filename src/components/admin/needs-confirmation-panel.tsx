"use client";

import { useState } from "react";
import { CalendarSearch, Loader2, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { SectionCard } from "./section-card";
import { TableSkeleton } from "./table-skeleton";
import { addDaysToKey, clinicDateKey } from "@/lib/clinic-time";

type ConfirmationStatus = "SENT" | "FAILED" | "SKIPPED";

interface NeedsConfirmationItem {
  id: string;
  referenceNumber: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: string;
  confirmationEmailSentAt: string | null;
  confirmationEmailStatus: ConfirmationStatus | null;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string;
  };
  service: { name: string; durationMin: number };
  dentist: { name: string };
}

interface NeedsConfirmationResponse {
  appointments: NeedsConfirmationItem[];
  windowDays: number;
  from: string;
  to: string;
}

type ViewState = "idle" | "loading" | "loaded" | "error";

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}

function fmtDate(key: string): string {
  return new Date(`${key}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Human relative label ("Tomorrow", "In 2 days") based on the clinic day. */
function dayLabel(isoDate: string): string {
  const targetKey = isoDate.slice(0, 10);
  const todayKey = clinicDateKey();
  if (targetKey === todayKey) return "Today";
  if (targetKey === addDaysToKey(todayKey, 1)) return "Tomorrow";
  const diff = Math.round(
    (Date.parse(`${targetKey}T00:00:00.000Z`) - Date.parse(`${todayKey}T00:00:00.000Z`)) / 86_400_000,
  );
  return diff > 1 ? `In ${diff} days` : fmtDate(targetKey);
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NeedsConfirmationPanel() {
  const [state, setState] = useState<ViewState>("idle");
  const [data, setData] = useState<NeedsConfirmationResponse | null>(null);
  const [error, setError] = useState("");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  async function check() {
    setState("loading");
    setError("");
    try {
      const res = await fetch("/api/appointments/needs-confirmation", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "Unable to check appointments.");
      setData(body.data);
      setLastChecked(new Date());
      setState("loaded");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to check appointments.");
      setState("error");
    }
  }

  function patchRow(id: string, patch: Partial<NeedsConfirmationItem>) {
    setData((prev) =>
      prev
        ? { ...prev, appointments: prev.appointments.map((a) => (a.id === id ? { ...a, ...patch } : a)) }
        : prev,
    );
  }

  async function sendConfirmation(item: NeedsConfirmationItem) {
    if (!item.patient.email) return;
    setSendingId(item.id);
    try {
      const res = await fetch(`/api/appointments/${item.id}/confirmation-email`, { method: "POST" });
      const body = await res.json();
      const status: ConfirmationStatus = body?.data?.status ?? "FAILED";
      const sentAt: string | null = body?.data?.sentAt ?? null;

      if (!res.ok) {
        patchRow(item.id, { confirmationEmailStatus: "FAILED" });
        throw new Error(body.message || "Unable to send the confirmation email.");
      }

      patchRow(item.id, { confirmationEmailStatus: status, confirmationEmailSentAt: sentAt });
      if (status === "SKIPPED") {
        toast.message("Confirmation email skipped — email is in preview mode.");
      } else {
        toast.success(`Confirmation email sent to ${item.patient.email}.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to send the confirmation email.");
    } finally {
      setSendingId(null);
    }
  }

  const appointments = data?.appointments ?? [];
  const loading = state === "loading";

  return (
    <SectionCard
      title="Needs Confirmation"
      description={
        data
          ? `Pending appointments within the next ${data.windowDays}-day window.`
          : "Check for pending appointments that still need confirmation."
      }
      padded={false}
      actions={
        <button
          onClick={check}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <CalendarSearch size={14} aria-hidden />
          )}
          {loading ? "Checking..." : "Check Appointments"}
        </button>
      }
    >
      {state === "idle" ? (
        <EmptyState
          icon={CalendarSearch}
          title="No check run yet"
          description="Click “Check Appointments” to find pending appointments that need confirmation."
        />
      ) : state === "error" ? (
        <ErrorState message={error} onRetry={check} />
      ) : loading ? (
        <TableSkeleton rows={5} columns={6} />
      ) : appointments.length === 0 ? (
        <EmptyState
          icon={CalendarSearch}
          title="Nothing needs confirmation"
          description="No pending appointments are scheduled within the confirmation window right now."
        />
      ) : (
        <>
          <div
            className={`overflow-x-auto ${loading ? "opacity-60 transition-opacity" : ""}`}
            aria-busy={loading}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Appointment</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">Service</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Dentist</th>
                  <th className="px-4 py-3 font-medium">Confirmation</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {appointments.map((item) => {
                  const noEmail = !item.patient.email;
                  const isSending = sendingId === item.id;
                  const cStatus = item.confirmationEmailStatus;
                  const actionLabel = noEmail
                    ? "No email"
                    : isSending
                      ? "Sending..."
                      : cStatus === "SENT"
                        ? "Resend"
                        : cStatus
                          ? "Retry"
                          : "Send confirmation";

                  return (
                    <tr key={item.id} className="transition-colors hover:bg-accent-soft/40">
                      <td className="px-4 py-3">
                        <p className="font-medium text-text">
                          {item.patient.firstName} {item.patient.lastName}
                        </p>
                        <p className="text-xs text-text-muted">
                          {item.patient.email || item.patient.phone}
                        </p>
                        <p className="font-mono text-xs text-text-muted">{item.referenceNumber}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-text">{dayLabel(item.appointmentDate)}</p>
                        <p className="text-xs text-text-muted">
                          {fmtDate(item.appointmentDate.slice(0, 10))} · {fmtTime(item.startTime)}
                        </p>
                      </td>
                      <td className="hidden px-4 py-3 text-text-secondary lg:table-cell">
                        {item.service.name}
                      </td>
                      <td className="hidden px-4 py-3 text-text-secondary md:table-cell">
                        {item.dentist.name}
                      </td>
                      <td className="px-4 py-3">
                        {cStatus === "SENT" ? (
                          <div>
                            <span className="inline-flex rounded-full bg-success-bg px-2.5 py-0.5 text-xs font-semibold text-success">
                              Sent
                            </span>
                            {item.confirmationEmailSentAt && (
                              <p className="mt-1 text-[11px] text-text-muted">
                                {fmtWhen(item.confirmationEmailSentAt)}
                              </p>
                            )}
                          </div>
                        ) : cStatus === "FAILED" ? (
                          <span className="inline-flex rounded-full bg-error-bg px-2.5 py-0.5 text-xs font-semibold text-error">
                            Failed
                          </span>
                        ) : cStatus === "SKIPPED" ? (
                          <span className="inline-flex rounded-full bg-neutral-bg px-2.5 py-0.5 text-xs font-semibold text-neutral-c">
                            Skipped
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-semibold text-warning">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => sendConfirmation(item)}
                          disabled={noEmail || isSending}
                          title={noEmail ? "This patient has no email on file" : undefined}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-all hover:border-border-accent hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isSending ? (
                            <Loader2 size={12} className="animate-spin" aria-hidden />
                          ) : (
                            <Send size={12} aria-hidden />
                          )}
                          {actionLabel}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-sm text-text-muted">
              {appointments.length} appointment{appointments.length === 1 ? "" : "s"}
              {lastChecked ? ` · Last checked ${fmtWhen(lastChecked.toISOString())}` : ""}
            </p>
            <button
              onClick={check}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-all hover:border-border-accent hover:bg-accent-soft hover:text-accent"
            >
              <RefreshCw size={12} aria-hidden />
              Check again
            </button>
          </div>
        </>
      )}
    </SectionCard>
  );
}
