"use client";

import { useCallback, useEffect, useState } from "react";
import { MailCheck, Play, RefreshCw, Send } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  DataTable,
  DataTableToolbar,
  useDataTable,
  type FilterableDataTableFeatures,
} from "./data-table";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { TableSkeleton } from "./table-skeleton";

interface FollowUpItem {
  id: string;
  scheduledFor: string;
  sentAt: string | null;
  status: string;
  error: string | null;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  };
  appointment?: {
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
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}

const columnHelper =
  createColumnHelper<FilterableDataTableFeatures, FollowUpItem>();

export function FollowUpsPanel({ role }: { role: string }) {
  const canManage = role === "ADMIN" || role === "RECEPTIONIST";

  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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

    fetch("/api/followups?all=true")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message);
        if (!cancelled) {
          setItems(body.data?.items || []);
        }
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Unable to load follow-ups.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function processDue() {
    setProcessing(true);
    try {
      const res = await fetch("/api/followups/process", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      const s = body.data || {};
      toast.success(
        `Processed ${s.processed ?? 0} follow-up${(s.processed ?? 0) === 1 ? "" : "s"} (${s.sent ?? 0} sent).`
      );
      load();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to process follow-ups."
      );
    } finally {
      setProcessing(false);
    }
  }

  async function sendNow(id: string) {
    setSendingId(id);
    try {
      const res = await fetch(`/api/followups/${id}/send`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      toast.success("Follow-up email sent.");
      load();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to send follow-up."
      );
    } finally {
      setSendingId(null);
    }
  }

  const columns = columnHelper.columns([
    // --- Patient ---
    columnHelper.accessor(
      (f) => `${f.patient.firstName} ${f.patient.lastName}`.trim(),
      {
        id: "patient",
        header: "Patient",
        cell: (info) => {
          const patient = info.row.original.patient;
          return (
            <>
              <p className="font-medium text-text">
                {patient.firstName} {patient.lastName}
              </p>
              <p className="max-w-[200px] truncate text-xs text-text-muted">
                {patient.email || "No email on file"}
              </p>
            </>
          );
        },
      }
    ),
    // --- Visit ---
    columnHelper.accessor(
      (f) => f.appointment?.referenceNumber ?? "",
      {
        id: "visit",
        header: "Visit",
        meta: { cellClassName: "hidden md:table-cell" },
        cell: (info) => {
          const appt = info.row.original.appointment;
          if (!appt) {
            return <span className="text-text-muted">{"\u2014"}</span>;
          }
          return (
            <>
              <p className="text-text-secondary">
                {fmtDate(appt.appointmentDate)} · {fmtTime(appt.startTime)}
              </p>
              <p className="text-xs text-text-muted">
                {appt.referenceNumber} · {appt.service.name}
              </p>
            </>
          );
        },
      }
    ),
    // --- Scheduled For ---
    columnHelper.accessor((f) => f.scheduledFor, {
      header: "Scheduled For",
      cell: (info) => {
        const f = info.row.original;
        return (
          <span className="whitespace-nowrap text-text-secondary">
            {fmtDateTime(f.scheduledFor)}
            {f.status === "FAILED" && f.error && (
              <p
                className="mt-0.5 max-w-[220px] truncate text-xs text-error"
                title={f.error}
              >
                {f.error}
              </p>
            )}
          </span>
        );
      },
    }),
    // --- Status ---
    columnHelper.accessor((f) => f.status, {
      header: "Status",
      filterFn: "equalsString",
      cell: (info) => (
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            STATUS_STYLES[info.getValue()] || "bg-neutral-bg text-neutral-c"
          }`}
        >
          {info.getValue().replace("_", " ")}
        </span>
      ),
    }),
    // --- Actions (conditionally included) ---
    ...(canManage
      ? [
          columnHelper.display({
            id: "actions",
            header: () => <span className="block text-right">Actions</span>,
            meta: { cellClassName: "text-right" },
            cell: (info) => {
              const f = info.row.original;
              return (
                <>
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
                  {f.status === "SENDING" && (
                    <span className="text-xs text-text-muted">Sending...</span>
                  )}
                </>
              );
            },
          }),
        ]
      : []),
  ]);

  const table = useDataTable({
    columns,
    data: items,
    getRowId: (f) => f.id,
  });

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text">
            Follow-up Emails
          </h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Automatically emailed 1 day after each completed visit, per patient
            preference.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <button
              onClick={processDue}
              disabled={processing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              <Play size={14} />
              {processing ? "Processing..." : "Process due now"}
            </button>
          )}
        </div>
      </div>

      <div className="card-surface mt-3 animate-fade-in overflow-hidden">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading && items.length === 0 ? (
          <TableSkeleton rows={5} columns={4} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={MailCheck}
            title="No follow-ups yet"
            description="Follow-ups appear after appointments are marked completed."
          />
        ) : (
          <>
            <div className="px-4 pt-3">
              <DataTableToolbar
                table={table}
                searchPlaceholder="Search follow-ups..."
                filters={[
                  {
                    columnId: "status",
                    label: "statuses",
                    options: [
                      { value: "SCHEDULED", label: "Scheduled" },
                      { value: "SENT", label: "Sent" },
                      { value: "FAILED", label: "Failed" },
                      { value: "SKIPPED", label: "Skipped" },
                    ],
                  },
                ]}
              />
            </div>
            <div
              className="max-h-[400px] overflow-x-auto overflow-y-auto"
              aria-busy={loading}
            >
              <DataTable table={table} />
            </div>
          </>
        )}
        {!error && items.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-sm text-text-muted">
              {items.length} total follow-up
              {items.length === 1 ? "" : "s"}
            </p>
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
