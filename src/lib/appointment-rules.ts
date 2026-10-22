import type { AppointmentStatus } from "@prisma/client";
import { clinicDateKey } from "@/lib/clinic-time";

export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function appointmentEnd(start: string, duration: number): string | null {
  if (!isValidTime(start) || !Number.isInteger(duration) || duration <= 0) return null;
  const [h, m] = start.split(":").map(Number);
  const end = h * 60 + m + duration;
  return end < 1440 ? `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}` : null;
}

export function isFutureSlot(date: Date, start: string, now = new Date()): boolean {
  if (!Number.isFinite(date.getTime()) || !isValidTime(start)) return false;
  const key = date.toISOString().slice(0, 10);
  const today = clinicDateKey(now);
  return key > today || (key === today && new Date(`${key}T${start}:00+08:00`) > now);
}

const transitions: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["COMPLETED", "CANCELLED", "NO_SHOW"],
  COMPLETED: [], CANCELLED: [], NO_SHOW: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return from === to || transitions[from].includes(to);
}
