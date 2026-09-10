"use client";

import { useCallback, useEffect, useState } from "react";
import { MailCheck, MailX, Play, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

interface FollowUpItem {
  id: string;
  scheduledFor: string;
  sentAt: string | null;
  status: string;
  error: string | null;
  patient: { id: string; firstName: string; lastName: string; email: string | null };
  appointment: {
    id: string;
    referenceNumber: string;
    appointmentDate: string;
    startTime: string;
    service: { name: string };
  };
}

const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: "bg-warning/15 text-warning",
  SENDING: "bg-info/15 text-info",
  SENT: "bg-success-bg text-success",
  FAILED: "bg-error-bg text-error",
  SKIPPED: "bg-neutral-bg text-neutral-c",
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

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

export function FollowUpsPanel({ role }: { role: string }) {
  const canManage = role === "ADMIN" || role === "RECEPTIONIST";

  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [processing, setProcessing] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ page: "1", pageSize: "10" });
    if (statusFilter) qs.set("status", statusFilter);

    fetch(`/api/followups?${qs.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message);
        if (!cancelled) {
          setItems(body.data?.items || []);
          setTotal(body.data?.pagination?.total ?? 0);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load follow-ups.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [statusFilter, refreshKey]);

  async function processDue() {
    setProcessing(true);
    try {
      const res = await fetch("/api/followups/process", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      const s = body.data || {};
      toast.success(`Processed ${s.processed ?? 0} follow-up${(s.processed ?? 0) === 1 ? "" : "s"} (${s.sent ?? 0} sent).`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to process follow-ups.");
    } finally {
      setProcessing(false);
    }
  }

  async function sendNow(id: string) {
    setSendingId(id);
    try {
      const res = await fetch(`/api/followups/${id}/send`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      toast.success("Follow-up email sent.");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to send follow-up.");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text">Follow-up Emails</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Automatically emailed 1 day after each completed visit, per patient preference.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          >
            <option value="">All statuses</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="SKIPPED">Skipped</option>
          </select>
          {canManage && (
            <button
              onClick={processDue}
              disabled={processing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-[#0E0F10] transition hover:opacity-90 disabled:opacity-50"
            >
              <Play size={14} />
              {processing ? "Processing..." : "Process due now"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 animate-fade-in overflow-hidden rounded-xl border border-border bg-surface shadow">
        {error ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <MailX size={28} className="text-error" />
            <p className="mt-3 text-sm text-text-secondary">{error}</p>
            <button
              onClick={load}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition hover:border-border-accent hover:bg-accent-soft hover:text-accent"
            >
              <RefreshCw size={14} />
              Try Again
            </button>
          </div>
        ) : loading && items.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-text-muted">Loading follow-ups...</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center text-sm text-text-muted">
            <MailCheck size={32} className="opacity-60" />
            <span className="mt-3">
              {statusFilter ? `No follow-ups with status "${statusFilter.replace("_", " ").toLowerCase()}".` : "No follow-ups yet."}
            </span>
            {!statusFilter && <span className="mt-1 text-xs">Follow-ups appear after appointments are marked completed.</span>}
          </div>
        ) : (
          <div className="max-h-[400px] overflow-x-auto overflow-y-auto" aria-busy={loading}>
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-background-alt text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Patient</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Visit</th>
                  <th className="px-4 py-3 font-semibold">Scheduled For</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  {canManage && <th className="px-4 py-3 text-right font-semibold">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((f) => (
                  <tr key={f.id} className="transition-colors hover:bg-accent-soft">
                    <td className="px-4 py-3">
                      <p className="font-medium text-text">
                        {f.patient.firstName} {f.patient.lastName}
                      </p>
                      <p className="max-w-[200px] truncate text-xs text-text-muted">{f.patient.email || "No email on file"}</p>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <p className="text-text-secondary">
                        {fmtDate(f.appointment.appointmentDate)} Â· {fmtTime(f.appointment.startTime)}
                      </p>
                      <p className="text-xs text-text-muted">
                        {f.appointment.referenceNumber} Â· {f.appointment.service.name}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                      {fmtDateTime(f.scheduledFor)}
                      {f.status === "FAILED" && f.error && <p className="mt-0.5 max-w-[220px] truncate text-xs text-error" title={f.error}>{f.error}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[f.status] || "bg-neutral-bg text-neutral-c"}`}>
                        {f.status.replace("_", " ")}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        {(f.status === "SCHEDULED" || f.status === "FAILED") && (
                          <button
                            onClick={() => sendNow(f.id)}
                            disabled={sendingId === f.id}
                            className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-xs font-medium text-text-secondary transition-all hover:border-border-accent hover:bg-accent-soft hover:text-accent disabled:opacity-50"
                          >
                            <Send size={12} />
                            {sendingId === f.id ? "Sending..." : "Send now"}
                          </button>
                        )}
                        {f.status === "SENDING" && <span className="text-xs text-text-muted">Sending...</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!error && items.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-sm text-text-muted">{total} total follow-up{total === 1 ? "" : "s"}</p>
            {canManage && (
              <button
                onClick={load}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-all hover:border-border-accent hover:bg-accent-soft hover:text-accent"
              >
                <RefreshCw size={12} />
                Refresh
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}