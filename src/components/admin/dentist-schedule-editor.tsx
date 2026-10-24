"use client";

import { useEffect, useState } from "react";
import { CalendarX, RefreshCw, Save, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";
import { ErrorState } from "@/components/admin/error-state";
import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { TimeField } from "@/components/admin/time-field";

// ─── Types ───────────────────────────────────────────────────────────────────

const DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

type DayOfWeek = (typeof DAYS)[number];

const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

interface DayRow {
  dayOfWeek: DayOfWeek;
  isWorking: boolean;
  startTime: string;
  endTime: string;
  breakStart: string;
  breakEnd: string;
}

interface AvailabilityRow {
  dayOfWeek: DayOfWeek;
  isWorking: boolean;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
}

function defaultSchedule(): DayRow[] {
  return DAYS.map((day) => {
    const working = day !== "SUNDAY";
    return {
      dayOfWeek: day,
      isWorking: working,
      startTime: day === "SATURDAY" ? "10:00" : working ? "09:00" : "09:00",
      endTime: day === "SATURDAY" ? "15:00" : working ? "17:00" : "17:00",
      breakStart: "",
      breakEnd: "",
    };
  });
}

function toRow(a: AvailabilityRow): DayRow {
  return {
    dayOfWeek: a.dayOfWeek,
    isWorking: a.isWorking,
    startTime: a.isWorking ? a.startTime : "09:00",
    endTime: a.isWorking ? a.endTime : "17:00",
    breakStart: a.breakStart ?? "",
    breakEnd: a.breakEnd ?? "",
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

// ─── Shared input style ──────────────────────────────────────────────────────

// ─── Weekly Schedule Editor ──────────────────────────────────────────────────

export function DentistScheduleEditor({ dentistId }: { dentistId: string }) {
  const [rows, setRows] = useState<DayRow[]>(defaultSchedule());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/dentists/${dentistId}/availability`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message);
        if (!cancelled) {
          const list = Array.isArray(body.data) ? body.data : [];
          if (list.length > 0) {
            setRows(DAYS.map((day) => {
              const found = list.find((a: AvailabilityRow) => a.dayOfWeek === day);
              return found ? toRow(found) : defaultSchedule().find((r) => r.dayOfWeek === day)!;
            }));
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Unable to load the schedule.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dentistId, refreshKey]);

  function beginLoad() {
    setLoading(true);
    setLoadError("");
  }

  function reload() {
    beginLoad();
    setRefreshKey((k) => k + 1);
  }

  function updateRow(index: number, patch: Partial<DayRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    // Clear stale validation for the row the moment the user edits it.
    setErrors((prev) => {
      const next = { ...prev };
      delete next[String(index)];
      return next;
    });
  }

  function validateRows(): Record<string, string> {
    const next: Record<string, string> = {};
    rows.forEach((row, index) => {
      if (!row.isWorking) return;
      if (!row.startTime || !row.endTime) {
        next[String(index)] = "Set working hours.";
        return;
      }
      const start = toMinutes(row.startTime);
      const end = toMinutes(row.endTime);
      if (end <= start) {
        next[String(index)] = "End time must be after start time.";
        return;
      }
      const hasBreakStart = row.breakStart.trim() !== "";
      const hasBreakEnd = row.breakEnd.trim() !== "";
      if (hasBreakStart !== hasBreakEnd) {
        next[String(index)] = "Break start and end must be provided together.";
        return;
      }
      if (hasBreakStart && hasBreakEnd) {
        const bs = toMinutes(row.breakStart);
        const be = toMinutes(row.breakEnd);
        if (be <= bs) {
          next[String(index)] = "Break end must be after break start.";
          return;
        }
        if (bs <= start || be >= end) {
          next[String(index)] = "Break must be within working hours.";
          return;
        }
      }
    });
    return next;
  }

  async function handleSave() {
    const nextErrors = validateRows();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error("Please fix the highlighted schedule entries.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/dentists/${dentistId}/availability`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          availability: rows.map((row) => ({
            dayOfWeek: row.dayOfWeek,
            isWorking: row.isWorking,
            startTime: row.isWorking ? row.startTime : "00:00",
            endTime: row.isWorking ? row.endTime : "00:00",
            breakStart: row.isWorking && row.breakStart.trim() ? row.breakStart.trim() : null,
            breakEnd: row.isWorking && row.breakEnd.trim() ? row.breakEnd.trim() : null,
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      toast.success("Schedule saved successfully.");
      setErrors({});
      setSavedCount((c) => c + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save the schedule.");
    } finally {
      setSaving(false);
    }
  }

  const dirtyCount = rows.filter((r) => r.isWorking).length;

  return (
    <SectionCard
      title="Weekly Schedule"
      description="Set working hours and breaks. Booking availability is recalculated automatically from this schedule."
      actions={
        <Button variant="outline" size="default" onClick={reload}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </Button>
      }
      footer={
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-xs text-text-muted">
            {savedCount > 0
              ? `Last saved just now — ${dirtyCount} working day(s).`
              : `Currently ${dirtyCount} working day(s). Non-working days are excluded from booking.`}
          </p>
          <Button
            onClick={handleSave}
            variant="primary"
            size="default"
            disabled={saving || loading}
          >
            <Save aria-hidden />
            {saving ? "Saving..." : "Save Schedule"}
          </Button>
        </div>
      }
    >
      {loadError ? (
        <ErrorState
          title="Unable to load the schedule"
          message={loadError}
          onRetry={reload}
          icon={CalendarX}
        />
      ) : loading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-control bg-surface-alt" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((row, index) => {
            const error = errors[String(index)];
            return (
              <div key={row.dayOfWeek} className="py-3 first:pt-0 last:pb-0">
                {/* Day row */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => updateRow(index, { isWorking: !row.isWorking })}
                      className="flex h-11 items-center gap-2 rounded-control border border-border bg-surface-alt px-2.5 text-sm font-medium transition hover:border-border-accent"
                      aria-pressed={row.isWorking}
                      aria-label={`${DAY_LABELS[row.dayOfWeek]} ${row.isWorking ? "working" : "not working"}`}
                    >
                      {row.isWorking ? (
                        <ToggleRight size={20} className="text-success" />
                      ) : (
                        <ToggleLeft size={20} className="text-text-muted" />
                      )}
                      <span className={row.isWorking ? "text-success" : "text-text-muted"}>
                        {row.isWorking ? "Working" : "Off"}
                      </span>
                    </button>
                    <span className="font-medium text-text">{DAY_LABELS[row.dayOfWeek]}</span>
                  </div>
                </div>

                {/* Time fields when working */}
                {row.isWorking && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <TimeField
                        label="Start"
                        disabled={saving}
                        required
                        value={row.startTime}
                        onChange={(value) => updateRow(index, { startTime: value })}
                        ariaLabel={`${DAY_LABELS[row.dayOfWeek]} start time`}
                      />
                      <TimeField
                        label="End"
                        disabled={saving}
                        required
                        value={row.endTime}
                        onChange={(value) => updateRow(index, { endTime: value })}
                        ariaLabel={`${DAY_LABELS[row.dayOfWeek]} end time`}
                      />
                      <TimeField
                        label="Break start"
                        disabled={saving}
                        value={row.breakStart}
                        onChange={(value) => updateRow(index, { breakStart: value })}
                        ariaLabel={`${DAY_LABELS[row.dayOfWeek]} break start`}
                      />
                      <TimeField
                        label="Break end"
                        disabled={saving}
                        value={row.breakEnd}
                        onChange={(value) => updateRow(index, { breakEnd: value })}
                        ariaLabel={`${DAY_LABELS[row.dayOfWeek]} break end`}
                      />
                  </div>
                )}

                {error && (
                  <p role="alert" className="mt-2 text-xs font-medium text-error">
                    {error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
