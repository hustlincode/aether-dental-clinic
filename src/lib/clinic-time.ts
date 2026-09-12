// ---------------------------------------------------------------------------
// Clinic time helpers
// ---------------------------------------------------------------------------
// Appointment.appointmentDate is stored as a @db.Date column, which Prisma
// surfaces as a JS Date at UTC midnight. "Today"/"tomorrow" for the clinic
// therefore cannot use the server's local timezone — the clinic runs on
// Asia/Manila (UTC+8). These helpers derive the clinic-local calendar date and
// map it back to the UTC-midnight values stored in the database.

export const CLINIC_TZ = "Asia/Manila";

/**
 * Lead time (in clinic-local days) for the Needs Confirmation window.
 * Configurable via the `CONFIRMATION_WINDOW_DAYS` env var (default 2).
 */
export const CONFIRMATION_LEAD_DAYS: number = (() => {
  const raw = Number(process.env.CONFIRMATION_WINDOW_DAYS);
  return Number.isInteger(raw) && raw >= 1 ? raw : 2;
})();

/** Clinic-local calendar date for a given instant, as a `YYYY-MM-DD` key. */
export function clinicDateKey(instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Add days to a `YYYY-MM-DD` key (calendar-safe, timezone-free). */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Convert a `YYYY-MM-DD` key into the UTC-midnight Date stored by @db.Date. */
export function dateKeyToUtc(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** Clinic-local hour (0-23) for a given instant. */
export function clinicHour(instant: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: CLINIC_TZ,
      hour: "2-digit",
      hour12: false,
    }).format(instant),
  );
}

/**
 * Date range [from, to] (inclusive) of upcoming appointments that should be
 * chased for confirmation: clinic-tomorrow through clinic-today + leadDays.
 */
export function confirmationWindow(instant: Date = new Date()): {
  from: Date;
  to: Date;
} {
  const todayKey = clinicDateKey(instant);
  const fromKey = addDaysToKey(todayKey, 1);
  const toKey = addDaysToKey(todayKey, CONFIRMATION_LEAD_DAYS);
  return { from: dateKeyToUtc(fromKey), to: dateKeyToUtc(toKey) };
}
