import { NotificationType, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";

// -----------------------------------------------------------------------------
// In-app notification service.
// Notifications are the "things staff should know about / act on" stream.
// They are intentionally separate from the Activity (audit) log.
// -----------------------------------------------------------------------------

export type NotificationEventType = "appointment" | "patient" | "dentist";

export interface NotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  entityType: NotificationEventType;
  entityId?: string;
}

/** Shape required to build appointment notification messages. */
interface ApptForNotification {
  id: string;
  referenceNumber: string;
  appointmentDate: Date;
  startTime: string;
  patient: { firstName: string; lastName: string };
  dentist: { id: string; name: string; email: string };
  service: { name: string };
}

interface PatientForNotification {
  id: string;
  firstName: string;
  lastName: string;
}

// ─── Core primitives ─────────────────────────────────────────────────────────

export async function createNotification(userId: string, input: NotificationInput) {
  return prisma.notification.create({ data: { userId, ...input } });
}

/** Creates the same notification for multiple users; returns how many were created. */
export async function notifyUsers(userIds: string[], input: Omit<NotificationInput, "userId">) {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return 0;
  const result = await prisma.notification.createMany({
    data: unique.map((userId) => ({ userId, ...input })),
  });
  return result.count;
}

/** Ids of every active staff user with one of the given roles. */
export async function getUsersByRole(...roles: Role[]) {
  const users = await prisma.user.findMany({
    where: { role: { in: roles }, active: true },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** Returns the User id of the staff account linked to a dentist (same email), or null. */
export async function getDentistUserId(dentistEmail: string) {
  const user = await prisma.user.findUnique({
    where: { email: dentistEmail },
    select: { id: true },
  });
  return user?.id ?? null;
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}

// appointmentDate is stored as @db.Date at UTC midnight; format in UTC so the
// message date always matches the booked date regardless of server timezone.
function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function patientName(p: ApptForNotification["patient"] | PatientForNotification): string {
  return `${p.firstName} ${p.lastName}`;
}

// ─── Appointment triggers ────────────────────────────────────────────────────

/** New appointment booked → Admin + Receptionist. */
export async function notifyAppointmentCreated(appt: ApptForNotification) {
  const userIds = await getUsersByRole(Role.ADMIN, Role.RECEPTIONIST);
  return notifyUsers(userIds, {
    type: NotificationType.APPOINTMENT_CREATED,
    title: "New appointment",
    message: `${patientName(appt.patient)} booked ${appt.service.name} for ${fmtDate(appt.appointmentDate)} at ${fmtTime(appt.startTime)}.`,
    entityType: "appointment",
    entityId: appt.id,
  });
}

/** Appointment confirmed → Admin + Receptionist. */
export async function notifyAppointmentConfirmed(appt: ApptForNotification) {
  const userIds = await getUsersByRole(Role.ADMIN, Role.RECEPTIONIST);
  return notifyUsers(userIds, {
    type: NotificationType.APPOINTMENT_CONFIRMED,
    title: "Appointment confirmed",
    message: `${patientName(appt.patient)}'s appointment has been confirmed for ${fmtDate(appt.appointmentDate)} at ${fmtTime(appt.startTime)}.`,
    entityType: "appointment",
    entityId: appt.id,
  });
}

/** Appointment moved to a new date/time → Admin + Receptionist + assigned Dentist. */
export async function notifyAppointmentRescheduled(
  appt: ApptForNotification,
  previous?: { date?: Date; time?: string }
) {
  const userIds = await getUsersByRole(Role.ADMIN, Role.RECEPTIONIST);
  const dentistUserId = await getDentistUserId(appt.dentist.email);
  if (dentistUserId) userIds.push(dentistUserId);

  const detail = previous?.time
    ? `${fmtDate(previous.date ?? appt.appointmentDate)} at ${fmtTime(previous.time)}`
    : `${fmtDate(appt.appointmentDate)} at ${fmtTime(appt.startTime)}`;

  return notifyUsers(userIds, {
    type: NotificationType.APPOINTMENT_RESCHEDULED,
    title: "Appointment rescheduled",
    message: `${patientName(appt.patient)}'s appointment was moved to ${detail}.`,
    entityType: "appointment",
    entityId: appt.id,
  });
}

/** Appointment cancelled → Admin + Receptionist + assigned Dentist. */
export async function notifyAppointmentCancelled(appt: ApptForNotification) {
  const userIds = await getUsersByRole(Role.ADMIN, Role.RECEPTIONIST);
  const dentistUserId = await getDentistUserId(appt.dentist.email);
  if (dentistUserId) userIds.push(dentistUserId);

  return notifyUsers(userIds, {
    type: NotificationType.APPOINTMENT_CANCELLED,
    title: "Appointment cancelled",
    message: `${patientName(appt.patient)} cancelled the ${appt.service.name} appointment scheduled for ${fmtDate(appt.appointmentDate)}.`,
    entityType: "appointment",
    entityId: appt.id,
  });
}

/** Patient checked in → assigned Dentist + Receptionist. */
export async function notifyPatientCheckedIn(appt: ApptForNotification) {
  const userIds = await getUsersByRole(Role.RECEPTIONIST);
  const dentistUserId = await getDentistUserId(appt.dentist.email);
  if (dentistUserId) userIds.push(dentistUserId);

  return notifyUsers(userIds, {
    type: NotificationType.PATIENT_CHECKED_IN,
    title: "Patient checked in",
    message: `${patientName(appt.patient)} has checked in for the ${fmtTime(appt.startTime)} appointment.`,
    entityType: "appointment",
    entityId: appt.id,
  });
}

/** Appointment completed → Admin + Receptionist + assigned Dentist. */
export async function notifyAppointmentCompleted(appt: ApptForNotification) {
  const userIds = await getUsersByRole(Role.ADMIN, Role.RECEPTIONIST);
  const dentistUserId = await getDentistUserId(appt.dentist.email);
  if (dentistUserId) userIds.push(dentistUserId);

  return notifyUsers(userIds, {
    type: NotificationType.APPOINTMENT_COMPLETED,
    title: "Appointment completed",
    message: `${patientName(appt.patient)}'s appointment with ${appt.dentist.name} has been completed.`,
    entityType: "appointment",
    entityId: appt.id,
  });
}

// ─── Patient triggers ────────────────────────────────────────────────────────

/** New patient registered → Admin + Receptionist. */
export async function notifyPatientCreated(patient: PatientForNotification) {
  const userIds = await getUsersByRole(Role.ADMIN, Role.RECEPTIONIST);
  return notifyUsers(userIds, {
    type: NotificationType.PATIENT_CREATED,
    title: "New patient",
    message: `${patientName(patient)} has been registered as a new patient.`,
    entityType: "patient",
    entityId: patient.id,
  });
}

/** Meaningful patient update → Admin + Receptionist. */
export async function notifyPatientUpdated(patient: PatientForNotification, changeDescription: string) {
  const userIds = await getUsersByRole(Role.ADMIN, Role.RECEPTIONIST);
  return notifyUsers(userIds, {
    type: NotificationType.PATIENT_UPDATED,
    title: "Patient updated",
    message: `${patientName(patient)}'s record was updated (${changeDescription}).`,
    entityType: "patient",
    entityId: patient.id,
  });
}

// ─── Appointment reminders ───────────────────────────────────────────────────

/**
 * Simple MVP reminder rule: appointments scheduled for *tomorrow* with a status
 * of PENDING / CONFIRMED / CHECKED_IN generate "appointment reminder"
 * notifications for Admin, Receptionist, and the assigned Dentist.
 *
 * Idempotent: appointments that already have a reminder notification are skipped.
 */
export async function processUpcomingAppointmentReminders() {
  const now = new Date();
  const tomorrowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const dayAfterStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2));

  const appointments = await prisma.appointment.findMany({
    where: {
      appointmentDate: { gte: tomorrowStart, lt: dayAfterStart },
      status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] },
      dentist: { status: "ACTIVE" },
    },
    include: { patient: true, dentist: true, service: true },
  });
  if (appointments.length === 0) return { checked: 0, created: 0 };

  const existing = await prisma.notification.findMany({
    where: { type: NotificationType.APPOINTMENT_REMINDER, entityId: { in: appointments.map((a) => a.id) } },
    select: { entityId: true, userId: true },
  });
  const seen = new Set(existing.map((n) => `${n.userId}:${n.entityId}`));

  const adminAndReception = await getUsersByRole(Role.ADMIN, Role.RECEPTIONIST);

  const rows: Prisma.NotificationCreateManyInput[] = [];
  for (const appt of appointments) {
    const message = `${appt.patient.firstName} ${appt.patient.lastName} has an appointment tomorrow at ${fmtTime(appt.startTime)}.`;
    const targets = [...adminAndReception];
    const dentistUserId = await getDentistUserId(appt.dentist.email);
    if (dentistUserId) targets.push(dentistUserId);

    for (const userId of new Set(targets)) {
      const key = `${userId}:${appt.id}`;
      if (seen.has(key)) continue;
      rows.push({
        userId,
        type: NotificationType.APPOINTMENT_REMINDER,
        title: "Appointment reminder",
        message,
        entityType: "appointment",
        entityId: appt.id,
      });
    }
  }

  let created = 0;
  if (rows.length > 0) {
    // createMany in chunks (Postgres supports large batches, 10k rows cap).
    for (let i = 0; i < rows.length; i += 1000) {
      const batch = await prisma.notification.createMany({ data: rows.slice(i, i + 1000) });
      created += batch.count;
    }
  }

  return { checked: appointments.length, created };
}

// ─── Lifecycle helpers ───────────────────────────────────────────────────────

/** Marks a single notification read — verifies ownership. Returns true if changed. */
export async function markNotificationAsRead(userId: string, notificationId: string) {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return result.count > 0;
}

/** Marks all of the user's notifications as read; returns how many were updated. */
export async function markAllNotificationsAsRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return result.count;
}

export async function getUnreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export interface NotificationListParams {
  page: number;
  pageSize: number;
  unreadOnly?: boolean;
}

/** Paginated notification list (newest first) — always scoped to one user. */
export async function getNotifications(userId: string, params: NotificationListParams) {
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(params.unreadOnly ? { isRead: false } : {}),
  };

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return {
    items,
    total,
    unreadCount,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.ceil(total / params.pageSize),
  };
}