import { CalendarPlus, CalendarCheck2, CalendarClock, CalendarX2, BellRing, UserPlus, UserCheck, CalendarHeart, CalendarDays, type LucideIcon } from "lucide-react";

/** Notification type → human label used across the UI. */
export const TYPE_LABEL: Record<string, string> = {
  APPOINTMENT_CREATED: "New appointment",
  APPOINTMENT_CONFIRMED: "Appointment confirmed",
  APPOINTMENT_REMINDER: "Appointment reminder",
  APPOINTMENT_RESCHEDULED: "Appointment rescheduled",
  APPOINTMENT_CANCELLED: "Appointment cancelled",
  PATIENT_CHECKED_IN: "Patient checked in",
  APPOINTMENT_COMPLETED: "Appointment completed",
  PATIENT_CREATED: "New patient",
  PATIENT_UPDATED: "Patient updated",
};

const TYPE_ICON: Record<string, LucideIcon> = {
  APPOINTMENT_CREATED: CalendarPlus,
  APPOINTMENT_CONFIRMED: CalendarCheck2,
  APPOINTMENT_REMINDER: BellRing,
  APPOINTMENT_RESCHEDULED: CalendarClock,
  APPOINTMENT_CANCELLED: CalendarX2,
  PATIENT_CHECKED_IN: UserCheck,
  APPOINTMENT_COMPLETED: CalendarHeart,
  PATIENT_CREATED: UserPlus,
  PATIENT_UPDATED: UserCheck,
};

const TYPE_COLOR: Record<string, string> = {
  APPOINTMENT_CREATED: "text-accent bg-accent-soft",
  APPOINTMENT_CONFIRMED: "text-info bg-info-bg",
  APPOINTMENT_REMINDER: "text-warning bg-warning-bg",
  APPOINTMENT_RESCHEDULED: "text-warning bg-warning-bg",
  APPOINTMENT_CANCELLED: "text-error bg-error-bg",
  PATIENT_CHECKED_IN: "text-accent bg-accent-soft",
  APPOINTMENT_COMPLETED: "text-success bg-success-bg",
  PATIENT_CREATED: "text-success bg-success-bg",
  PATIENT_UPDATED: "text-info bg-info-bg",
};

export function notificationIcon(type: string): LucideIcon {
  return TYPE_ICON[type] || CalendarDays;
}

export function notificationColor(type: string): string {
  return TYPE_COLOR[type] || "text-text-secondary bg-background-alt";
}

export function typeLabel(type: string): string {
  return TYPE_LABEL[type] || type.replace(/_/g, " ").toLowerCase();
}