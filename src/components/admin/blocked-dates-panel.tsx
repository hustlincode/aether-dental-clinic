"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, CalendarX, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";

interface BlockedDate {
  id: string;
  date: string;
  reason: string | null;
}

function formatDay(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const inputClass =
  "h-auto w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder-text-muted transition focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function BlockedDatesPanel({ dentistId }: { dentistId: string }) {
  const [dates, setDates] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<BlockedDate | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/dentists/${dentistId}/blocked-dates`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message);
        if (!cancelled) setDates((Array.isArray(body.data) ? body.data : []) as BlockedDate[]);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Unable to load blocked dates.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dentistId, refreshKey]);

  function reload() {
    setLoading(true);
    setLoadError("");
    setRefreshKey((k) => k + 1);
  }

  const today = new Date().toISOString().slice(0, 10);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!date) {
      toast.error("Select a date to block.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/dentists/${dentistId}/blocked-dates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, reason: reason.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      toast.success("Date blocked successfully.");
      setDate("");
      setReason("");
      setDates((prev) => [...prev, body.data as BlockedDate].sort((a, b) => a.date.localeCompare(b.date)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to block this date.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmRemove() {
    if (!pendingRemove) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/dentists/${dentistId}/blocked-dates/${pendingRemove.id}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      toast.success("Blocked date removed.");
      setDates((prev) => prev.filter((d) => d.id !== pendingRemove.id));
      setPendingRemove(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove the blocked date.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Upcoming blocked dates */}
      <section className="card-surface overflow-hidden">
        <header className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text">Blocked Dates</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Days when this dentist is unavailable, regardless of schedule.
            </p>
          </div>
          <button
            onClick={reload}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary transition-all hover:border-border-accent hover:bg-accent-soft hover:text-accent"
          >
            <CalendarX size={16} />
            Refresh
          </button>
        </header>

        <div className="p-5">
          {loadError ? (
            <ErrorState title="Unable to load blocked dates" message={loadError} onRetry={reload} icon={CalendarX} />
          ) : loading ? (
            <div className="flex min-h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            </div>
          ) : dates.length === 0 ? (
            <EmptyState
              icon={CalendarX}
              title="No blocked dates"
              description="This dentist is available on every working day. Block a date on the right to take it off the calendar."
            />
          ) : (
            <ul className="divide-y divide-border">
              {dates.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium text-text">{formatDay(item.date)}</p>
                    {item.reason && <p className="mt-0.5 text-xs text-text-muted">{item.reason}</p>}
                  </div>
                  <button
                    onClick={() => setPendingRemove(item)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-secondary transition hover:border-error/40 hover:bg-error-bg hover:text-error"
                    aria-label={`Remove blocked date for ${formatDay(item.date)}`}
                  >
                    <Trash2 size={14} />
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Add blocked date */}
      <section className="card-surface h-fit overflow-hidden">
        <header className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-text">Block a Date</h2>
          <p className="mt-0.5 text-xs text-text-muted">Leave the reason empty for a generic block.</p>
        </header>
        <form onSubmit={handleAdd} className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-secondary">Date</span>
            <input
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-secondary">Reason (optional)</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder="e.g. Training day"
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={submitting || loading || !date}
            className="gradient-gold inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus size={16} />}
            {submitting ? "Blocking..." : "Block Date"}
          </button>
        </form>
      </section>

      <ConfirmDialog
        open={pendingRemove !== null}
        title="Remove blocked date?"
        message={
          pendingRemove
            ? `This will make ${formatDay(pendingRemove.date)} available for booking again.`
            : ""
        }
        confirmLabel={removing ? "Removing..." : "Remove"}
        destructive
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  );
}