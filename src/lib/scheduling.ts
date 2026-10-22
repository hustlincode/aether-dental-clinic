import { prisma } from "@/lib/db";
import type { Prisma, Service } from "@prisma/client";
import { isFutureSlot, isValidTime } from "@/lib/appointment-rules";
type ScheduleClient = Pick<Prisma.TransactionClient, "appointment" | "dentist" | "clinicSetting" | "blockedDate">;

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

/**
 * Returns the appointments for a dentist on a given date keyed by their occupied interval (in minutes).
 */
async function getOccupiedSlots(dentistId: string, date: Date, excludeId?: string, client: ScheduleClient = prisma) {
  const appointments = await client.appointment.findMany({
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

async function getContext(dentistId: string, date: Date, client: ScheduleClient): Promise<AvailabilityContext | null> {
  const [dentist, clinic] = await Promise.all([
    client.dentist.findUnique({
      where: { id: dentistId },
      include: { availability: true },
    }),
    client.clinicSetting.findUnique({ where: { id: "singleton" } }),
  ]);

  if (!dentist || dentist.status !== "ACTIVE") return null;
  if (!clinic) return null;

  const dayKey = DAY_KEYS[date.getUTCDay()];
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

/** Dates stored by @db.Date are UTC-midnight calendar values. */
function fmtDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface SlotWindow {
  clinicOpen: number;
  clinicClose: number;
  dayOpen: number;
  dayClose: number;
  breakStart: number | null;
  breakEnd: number | null;
  clinicBreakStart: number | null;
  clinicBreakEnd: number | null;
  occupied: { start: number; end: number }[];
  duration: number;
  date: Date;
}

/**
 * Pure slot generator shared by the single-day and multi-day lookups.
 * Windows are already minute-values; occupied is minute intervals.
 */
function generateSlots(opts: SlotWindow): Slot[] {
  const { clinicOpen, clinicClose, dayOpen, dayClose, occupied, duration, date } = opts;
  if (!Number.isInteger(duration) || duration <= 0 || duration >= 1440) return [];
  const open = Math.max(clinicOpen, dayOpen, 0);
  const close = Math.min(clinicClose, dayClose, 1439);
  const breaks = [
    { start: opts.breakStart, end: opts.breakEnd },
    { start: opts.clinicBreakStart, end: opts.clinicBreakEnd },
  ];
  const slots: Slot[] = [];
  for (let t = Math.ceil(open / 30) * 30; t + duration <= close; t += 30) {
    if (breaks.some((b) => b.start !== null && b.end !== null && t < b.end && t + duration > b.start)) continue;
    if (occupied.some((o) => t < o.end && t + duration > o.start)) continue;
    const start = toHHMM(t);
    if (isFutureSlot(date, start)) slots.push({ start, end: toHHMM(t + duration) });
  }
  return slots;
}

/**
 * Generates all available appointment slots for a dentist + service on a given date.
 * Accounts for: working schedule, clinic hours, lunch break, blocked dates, existing appointments, service duration.
 */
export async function getAvailableSlots(
  dentistId: string,
  service: Pick<Service, "id" | "durationMin">,
  date: Date,
  excludeId?: string,
  client: ScheduleClient = prisma
): Promise<Slot[] | null> {
  const ctx = await getContext(dentistId, date, client);
  if (!ctx) return null;

  const dayKey = DAY_KEYS[date.getUTCDay()];
  const dayOfWeek = FULL_DAY[dayKey];
  const dayAvail = ctx.dentistAvailability.find((a) => a.dayOfWeek === dayOfWeek);
  if (!dayAvail || !dayAvail.isWorking) return null;

  // Blocked dates check
  const blocked = await client.blockedDate.findFirst({
    where: { date, OR: [{ dentistId }, { dentistId: null }] },
  });
  if (blocked) return null;

  const occupied = await getOccupiedSlots(dentistId, date, excludeId, client);

  return generateSlots({
    clinicOpen: toMinutes(ctx.clinic.openingTime),
    clinicClose: toMinutes(ctx.clinic.closingTime),
    dayOpen: toMinutes(dayAvail.startTime),
    dayClose: toMinutes(dayAvail.endTime),
    breakStart: toMinutesOrNull(dayAvail.breakStart),
    breakEnd: toMinutesOrNull(dayAvail.breakEnd),
    clinicBreakStart: toMinutesOrNull(ctx.clinic.lunchBreakStart),
    clinicBreakEnd: toMinutesOrNull(ctx.clinic.lunchBreakEnd),
    occupied,
    duration: service.durationMin,
    date,
  });
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
  excludeId?: string,
  client: ScheduleClient = prisma
): Promise<boolean> {
  if (!isValidTime(startTime) || !isValidTime(endTime) || endTime <= startTime) return false;
  const durationMin = toMinutes(endTime) - toMinutes(startTime);
  const slots = await getAvailableSlots(dentistId, { id: "", durationMin }, appointmentDate, excludeId, client);
  return slots?.some((slot) => slot.start === startTime && slot.end === endTime) ?? false;
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
  endDate.setUTCHours(23, 59, 59, 999);
  endDate.setUTCDate(startDate.getUTCDate() + daysAhead - 1);

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
    d.setUTCDate(startDate.getUTCDate() + i);
    const key = fmtDateKey(d);
    if (blockedSet.has(key)) continue;

    const dayOfWeek = FULL_DAY[DAY_KEYS[d.getUTCDay()]];
    const dayAvail = dentist.availability.find((a) => a.dayOfWeek === dayOfWeek);
    if (!dayAvail || !dayAvail.isWorking) continue;

    const slots = generateSlots({
      clinicOpen: toMinutes(clinic.openingTime),
      clinicClose: toMinutes(clinic.closingTime),
      dayOpen: toMinutes(dayAvail.startTime),
      dayClose: toMinutes(dayAvail.endTime),
      breakStart: toMinutesOrNull(dayAvail.breakStart),
      breakEnd: toMinutesOrNull(dayAvail.breakEnd),
      clinicBreakStart: toMinutesOrNull(clinic.lunchBreakStart),
      clinicBreakEnd: toMinutesOrNull(clinic.lunchBreakEnd),
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
