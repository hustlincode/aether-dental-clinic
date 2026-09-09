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
async function getOccupiedSlots(dentistId: string, date: Date) {
  const appointments = await prisma.appointment.findMany({
    where: {
      dentistId,
      appointmentDate: date,
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
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
 * Generates all available appointment slots for a dentist + service on a given date.
 * Accounts for: working schedule, clinic hours, lunch break, blocked dates, existing appointments, service duration.
 */
export async function getAvailableSlots(
  dentistId: string,
  service: Pick<Service, "id" | "durationMin">,
  date: Date
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

  // Determine working window = intersection of clinic hours and dentist hours
  const open = Math.max(toMinutes(ctx.clinic.openingTime), toMinutes(dayAvail.startTime));
  const close = Math.min(toMinutes(ctx.clinic.closingTime), toMinutes(dayAvail.endTime));

  // Break window = dentist break or clinic lunch (whichever applies)
  const breakStart = dayAvail.breakStart ?? ctx.clinic.lunchBreakStart;
  const breakEnd = dayAvail.breakEnd ?? ctx.clinic.lunchBreakEnd;

  const duration = service.durationMin;
  const occupied = await getOccupiedSlots(dentistId, date);

  const slots: Slot[] = [];
  let t = open;
  while (t + duration <= close) {
    // Skip break window
    if (breakStart && breakEnd && t < toMinutes(breakEnd) && t + duration > toMinutes(breakStart)) {
      t = Math.max(t + 1, toMinutes(breakEnd));
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
  const result = Array.from(unique.values()).sort((a, b) => a.start.localeCompare(b.start));

  // Enforce 30-minute slot increments for a clean UI (start on :00 or :30)
  return result.filter((s) => s.start.endsWith(":00") || s.start.endsWith(":30"));
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
 */
export async function getAvailableDates(
  dentistId: string,
  service: Pick<Service, "id" | "durationMin">,
  startDate: Date,
  daysAhead: number
): Promise<string[]> {
  const available: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(startDate);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    if (seen.has(iso)) continue;
    seen.add(iso);
    const slots = await getAvailableSlots(dentistId, service, d);
    if (slots && slots.length > 0) {
      available.push(iso);
    }
  }
  return available;
}
