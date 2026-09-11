import { prisma } from "@/lib/db";
import type { Service } from "@prisma/client";

export interface Slot {
  start: string; // "HH:mm" 24h
  end: string; // "HH:mm" 24h
}

const DAY_KEYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
const FULL_DAY: Record<string, string> = {
  SUN: "SUNDAY", MON: "MONDAY", TUE: "TUESDAY", WED: "WEDNESDAY",
  THU: "THURSDAY", FRI: "FRIDAY", SAT: "SATURDAY",
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function toMinutesOrNull(v: string | null): number | null {
  return v != null ? toMinutes(v) : null;
}

function isDateTodayUtc(date: Date): boolean {
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

/**
 * Returns the appointments for a dentist on a given date keyed by their occupied interval (in minutes).
 */
async function getOccupiedSlots(dentistId: string, date: Date, excludeId?: string) {
  const appointments = await prisma.appointment.findMany({
    where: {
      dentistId,
      appointmentDate: date,
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { startTime: true, endTime: true },
  });
  return appointments.map((a) => ({
    start: toMinutes(a.startTime),
    end: toMinutes(a.endTime),
  }));
}

interface AvailabilityContext {
  clinic: {
    openingTime: string;
    closingTime: string;
    lunchBreakStart: string | null;
    lunchBreakEnd: string | null;
  };
  dentistAvailability: {
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    breakStart: string | null;
    breakEnd: string | null;
    isWorking: boolean;
  }[];
}

async function getContext(dentistId: string, date: Date): Promise<AvailabilityContext | null> {
  const [dentist, clinic] = await Promise.all([
    prisma.dentist.findUnique({
      where: { id: dentistId },
      include: { availability: true },
    }),
    prisma.clinicSetting.findUnique({ where: { id: "singleton" } }),
  ]);

  if (!dentist || dentist.status !== "ACTIVE") return null;
  if (!clinic) return null;

  const dayKey = DAY_KEYS[date.getDay()];
  const dayOfWeek = FULL_DAY[dayKey];

  const dayAvail = dentist.availability.find((a) => a.dayOfWeek === dayOfWeek);
  if (!dayAvail || !dayAvail.isWorking) return null;

  return {
    clinic: {
      openingTime: clinic.openingTime,
      closingTime: clinic.closingTime,
      lunchBreakStart: clinic.lunchBreakStart,
      lunchBreakEnd: clinic.lunchBreakEnd,
    },
    dentistAvailability: dentist.availability,
  };
}

/**
 * Formats a Date as a local-timezone "YYYY-MM-DD" key. Used for date keys in
 * availability results so they match the calendar dates a user in any timezone
 * actually sees (toISOString() would shift the day in UTC+ timezones).
 */
function fmtDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface SlotWindow {
  clinicOpen: number;
  clinicClose: number;
  dayOpen: number;
  dayClose: number;
  breakStart: number | null;
  breakEnd: number | null;
  occupied: { start: number; end: number }[];
  duration: number;
  date: Date;
}

/**
 * Pure slot generator shared by the single-day and multi-day lookups.
 * Windows are already minute-values; occupied is minute intervals.
 */
function generateSlots(opts: SlotWindow): Slot[] {
  const { clinicOpen, clinicClose, dayOpen, dayClose, breakStart, breakEnd, occupied, duration, date } = opts;
  const open = Math.max(clinicOpen, dayOpen);
  const close = Math.min(clinicClose, dayClose);

  const slots: Slot[] = [];
  let t = open;
  while (t + duration <= close) {
    // Skip break window
    if (breakStart && breakEnd && t < breakEnd && t + duration > breakStart) {
      t = Math.max(t + 1, breakEnd);
      continue;
    }
    // Skip if overlaps any occupied appointment
    const overlaps = occupied.some((o) => t < o.end && t + duration > o.start);
    if (!overlaps && !isInPastToday(date, t, duration)) {
      slots.push({ start: toHHMM(t), end: toHHMM(t + duration) });
    }
    t += 1; // 1-minute granularity to catch all durations; dedupe below
  }

  // Deduplicate overlapping slot starts (in case of 1-min iteration producing duplicate starts)
  const unique = new Map<string, Slot>();
  for (const s of slots) {
    if (!unique.has(s.start)) unique.set(s.start, s);
  }
  return Array.from(unique.values())
    .sort((a, b) => a.start.localeCompare(b.start))
    .filter((s) => s.start.endsWith(":00") || s.start.endsWith(":30"));
}

/**
 * Generates all available appointment slots for a dentist + service on a given date.
 * Accounts for: working schedule, clinic hours, lunch break, blocked dates, existing appointments, service duration.
 */
export async function getAvailableSlots(
  dentistId: string,
  service: Pick<Service, "id" | "durationMin">,
  date: Date,
  excludeId?: string
): Promise<Slot[] | null> {
  const ctx = await getContext(dentistId, date);
  if (!ctx) return null;

  const dayKey = DAY_KEYS[date.getDay()];
  const dayOfWeek = FULL_DAY[dayKey];
  const dayAvail = ctx.dentistAvailability.find((a) => a.dayOfWeek === dayOfWeek);
  if (!dayAvail || !dayAvail.isWorking) return null;

  // Blocked dates check
  const blocked = await prisma.blockedDate.findFirst({
    where: { date, OR: [{ dentistId }, { dentistId: null }] },
  });
  if (blocked) return null;

  const occupied = await getOccupiedSlots(dentistId, date, excludeId);

  return generateSlots({
    clinicOpen: toMinutes(ctx.clinic.openingTime),
    clinicClose: toMinutes(ctx.clinic.closingTime),
    dayOpen: toMinutes(dayAvail.startTime),
    dayClose: toMinutes(dayAvail.endTime),
    breakStart: dayAvail.breakStart != null ? toMinutes(dayAvail.breakStart) : toMinutesOrNull(ctx.clinic.lunchBreakStart),
    breakEnd: dayAvail.breakEnd != null ? toMinutes(dayAvail.breakEnd) : toMinutesOrNull(ctx.clinic.lunchBreakEnd),
    occupied,
    duration: service.durationMin,
    date,
  });
}

function isInPastToday(date: Date, startMin: number, duration: number): boolean {
  if (!isDateTodayUtc(date)) return false;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return startMin + duration <= nowMin;
}

/**
 * Checks whether a specific appointment (date + start/end) is still available for a dentist+service.
 * Used for server-side double-booking prevention on submission.
 */
export async function isSlotAvailable(
  dentistId: string,
  startTime: string,
  endTime: string,
  appointmentDate: Date,
  excludeId?: string
): Promise<boolean> {
  const conflicting = await prisma.appointment.findFirst({
    where: {
      dentistId,
      appointmentDate,
      id: excludeId ? { not: excludeId } : undefined,
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      // Times are stored as zero-padded "HH:mm", so string comparison is chronological.
      OR: [
        { startTime: { lte: startTime }, endTime: { gt: startTime } },
        { startTime: { lt: endTime }, endTime: { gte: endTime } },
        { startTime: { gte: startTime }, endTime: { lte: endTime } },
      ],
    },
  });

  return !conflicting;
}

/**
 * Returns a list of dates that have at least one available slot for the given dentist+service.
 * Used to build a "selectable dates" calendar in the public booking flow.
 *
 * Batched: loads the dentist + clinic + blocked dates + range appointments once
 * (O(1) queries total) instead of running a per-day round trip like before,
 * which made the availability calendar feel slow.
 */
export async function getAvailableDates(
  dentistId: string,
  service: Pick<Service, "id" | "durationMin">,
  startDate: Date,
  daysAhead: number
): Promise<string[]> {
  const available: string[] = [];

  const endDate = new Date(startDate);
  endDate.setHours(23, 59, 59, 999);
  endDate.setDate(startDate.getDate() + daysAhead - 1);

  const dentist = await prisma.dentist.findUnique({
    where: { id: dentistId },
    include: { availability: true },
  });
  if (!dentist || dentist.status !== "ACTIVE") return available;

  const clinic = await prisma.clinicSetting.findUnique({ where: { id: "singleton" } });
  if (!clinic) return available;

  const [blockedRows, apptRows] = await Promise.all([
    prisma.blockedDate.findMany({
      where: { date: { gte: startDate, lte: endDate }, OR: [{ dentistId }, { dentistId: null }] },
      select: { date: true },
    }),
    prisma.appointment.findMany({
      where: {
        dentistId,
        appointmentDate: { gte: startDate, lte: endDate },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
      select: { appointmentDate: true, startTime: true, endTime: true },
    }),
  ]);

  const blockedSet = new Set(blockedRows.map((b) => fmtDateKey(b.date)));
  const byDay = new Map<string, { start: number; end: number }[]>();
  for (const a of apptRows) {
    const key = fmtDateKey(a.appointmentDate);
    const list = byDay.get(key) ?? [];
    list.push({ start: toMinutes(a.startTime), end: toMinutes(a.endTime) });
    byDay.set(key, list);
  }

  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const key = fmtDateKey(d);
    if (blockedSet.has(key)) continue;

    const dayOfWeek = FULL_DAY[DAY_KEYS[d.getDay()]];
    const dayAvail = dentist.availability.find((a) => a.dayOfWeek === dayOfWeek);
    if (!dayAvail || !dayAvail.isWorking) continue;

    const slots = generateSlots({
      clinicOpen: toMinutes(clinic.openingTime),
      clinicClose: toMinutes(clinic.closingTime),
      dayOpen: toMinutes(dayAvail.startTime),
      dayClose: toMinutes(dayAvail.endTime),
      breakStart: dayAvail.breakStart != null ? toMinutes(dayAvail.breakStart) : toMinutesOrNull(clinic.lunchBreakStart),
      breakEnd: dayAvail.breakEnd != null ? toMinutes(dayAvail.breakEnd) : toMinutesOrNull(clinic.lunchBreakEnd),
      occupied: byDay.get(key) ?? [],
      duration: service.durationMin,
      date: d,
    });
    if (slots.length > 0) {
      available.push(key);
    }
  }

  return available;
}
