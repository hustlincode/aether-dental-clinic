import { z } from "zod";
import type { ClinicSetting, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppointmentError, appointmentTransaction } from "@/lib/appointment-transaction";
import { isFutureSlot, isValidDateKey, isValidTime } from "@/lib/appointment-rules";
import { clinicDateKey, dateKeyToUtc } from "@/lib/clinic-time";

const optionalText = (max: number) => z.string().trim().max(max).nullable().transform((value) => value || null);
const time = z.string().refine(isValidTime, "Use a valid HH:mm time.");
const optionalTime = z.union([time, z.literal(""), z.null()]).transform((value) => value || null);
const version = z.string().datetime();
const hoursFields = {
  openingTime: time, closingTime: time,
  lunchBreakStart: optionalTime, lunchBreakEnd: optionalTime,
};
const hoursSchema = z.object(hoursFields).superRefine((hours, ctx) => {
  if (hours.openingTime >= hours.closingTime) {
    ctx.addIssue({ code: "custom", path: ["closingTime"], message: "Closing time must be after opening time." });
  }
  const { lunchBreakStart: start, lunchBreakEnd: end } = hours;
  if ((start === null) !== (end === null) || (start !== null && end !== null &&
    (start >= end || start < hours.openingTime || end > hours.closingTime))) {
    ctx.addIssue({ code: "custom", path: ["lunchBreakStart"], message: "Provide both lunch times, in order and within clinic hours, or clear both." });
  }
});

export const configurationUpdateSchema = z.discriminatedUnion("section", [
  z.object({
    section: z.literal("contact"), updatedAt: version,
    address: optionalText(500), phone: optionalText(50),
    email: optionalText(254).refine((value) => value === null || z.email().safeParse(value).success, "Enter a valid email address."),
  }).strict(),
  z.object({ section: z.literal("hours"), updatedAt: version, ...hoursFields }).strict()
    .superRefine((value, ctx) => {
      const result = hoursSchema.safeParse(value);
      if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }),
]);

export const clinicClosureSchema = z.object({
  date: z.string().refine(isValidDateKey, "Use a real date in YYYY-MM-DD format."),
  reason: optionalText(200).optional(),
}).strict();

export class ConfigurationError extends AppointmentError {
  constructor(message: string, status = 409, public details?: unknown) { super(message, status); }
}

export function configurationData(row: ClinicSetting) {
  return {
    address: row.address, phone: row.phone, email: row.email,
    openingTime: row.openingTime, closingTime: row.closingTime,
    lunchBreakStart: row.lunchBreakStart, lunchBreakEnd: row.lunchBreakEnd,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getClinicConfiguration() {
  const row = await prisma.clinicSetting.findUnique({ where: { id: "singleton" } });
  if (!row) throw new ConfigurationError("Clinic configuration is missing. Complete clinic setup before editing settings.", 404);
  return configurationData(row);
}

function closureData(row: { id: string; date: Date; reason: string | null }) {
  return { id: row.id, date: row.date.toISOString().slice(0, 10), reason: row.reason };
}

export async function listClinicClosures() {
  return (await prisma.blockedDate.findMany({ where: { dentistId: null }, orderBy: { date: "asc" } })).map(closureData);
}

type Hours = Pick<ClinicSetting, "openingTime" | "closingTime" | "lunchBreakStart" | "lunchBreakEnd">;
export function appointmentFitsHours(appointment: { startTime: string; endTime: string }, hours: Hours) {
  return appointment.startTime >= hours.openingTime && appointment.endTime <= hours.closingTime &&
    !(hours.lunchBreakStart && hours.lunchBreakEnd && appointment.startTime < hours.lunchBreakEnd && appointment.endTime > hours.lunchBreakStart);
}

async function liveAppointments(tx: Prisma.TransactionClient, now: Date, date?: Date) {
  const rows = await tx.appointment.findMany({
    where: {
      appointmentDate: date ?? { gte: dateKeyToUtc(clinicDateKey(now)) },
      status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] },
    },
    select: { id: true, referenceNumber: true, appointmentDate: true, startTime: true, endTime: true, status: true },
    orderBy: [{ appointmentDate: "asc" }, { startTime: "asc" }],
  });
  const today = clinicDateKey(now);
  return rows.filter((row) => row.appointmentDate.toISOString().slice(0, 10) >= today &&
    (row.status === "CHECKED_IN" || isFutureSlot(row.appointmentDate, row.endTime, now)));
}

function rejectConflicts(rows: Awaited<ReturnType<typeof liveAppointments>>) {
  if (!rows.length) return;
  throw new ConfigurationError("Resolve the affected appointments before changing the clinic schedule.", 409, {
    appointmentCount: rows.length,
    appointments: rows.map(({ id, referenceNumber, appointmentDate, startTime, endTime }) => ({
      id, referenceNumber, date: appointmentDate.toISOString().slice(0, 10), startTime, endTime,
    })),
  });
}

export async function updateClinicConfiguration(input: unknown, userId: string, now = new Date()) {
  const body = configurationUpdateSchema.parse(input);
  return appointmentTransaction(async (tx) => {
    const current = await tx.clinicSetting.findUnique({ where: { id: "singleton" } });
    if (!current) throw new ConfigurationError("Clinic configuration is missing. Complete clinic setup before editing settings.", 404);
    if (current.updatedAt.getTime() !== new Date(body.updatedAt).getTime()) {
      throw new ConfigurationError("Configuration changed since you loaded it. Reload before saving.");
    }
    const { section } = body;
    const changes = body.section === "contact"
      ? { address: body.address, phone: body.phone, email: body.email }
      : { openingTime: body.openingTime, closingTime: body.closingTime, lunchBreakStart: body.lunchBreakStart, lunchBreakEnd: body.lunchBreakEnd };
    if (section === "hours") {
      const hours = hoursSchema.parse({ ...current, ...changes });
      const appointments = await liveAppointments(tx, now);
      rejectConflicts(appointments.filter((row) => appointmentFitsHours(row, current) && !appointmentFitsHours(row, hours)));
    }
    const updatedAt = new Date(Math.max(now.getTime(), current.updatedAt.getTime() + 1));
    const result = await tx.clinicSetting.updateMany({
      where: { id: current.id, updatedAt: current.updatedAt }, data: { ...changes, updatedAt },
    });
    if (result.count !== 1) throw new ConfigurationError("Configuration changed since you loaded it. Reload before saving.");
    const previous = Object.fromEntries(Object.keys(changes).map((key) => [key, current[key as keyof ClinicSetting]]));
    await tx.activity.create({ data: {
      action: "Clinic configuration updated", entity: "ClinicSetting", entityId: current.id, userId,
      description: JSON.stringify({ section, before: previous, after: changes }),
    } });
    return configurationData({ ...current, ...changes, updatedAt });
  });
}

export async function createClinicClosure(input: unknown, userId: string, now = new Date()) {
  const body = clinicClosureSchema.parse(input);
  if (body.date < clinicDateKey(now)) {
    throw new ConfigurationError("Choose today or a future date for a clinic closure.", 422, { date: ["The closure date cannot be in the past."] });
  }
  try {
    return await appointmentTransaction(async (tx) => {
      const date = dateKeyToUtc(body.date);
      if (await tx.blockedDate.findFirst({ where: { date, dentistId: null } })) {
        throw new ConfigurationError("The clinic is already closed on this date.");
      }
      rejectConflicts(await liveAppointments(tx, now, date));
      const row = await tx.blockedDate.create({ data: { date, reason: body.reason ?? null, dentistId: null } });
      await tx.activity.create({ data: {
        action: "Clinic closure added", entity: "BlockedDate", entityId: row.id, userId,
        description: JSON.stringify({ date: body.date, reason: row.reason }),
      } });
      return closureData(row);
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new ConfigurationError("The clinic is already closed on this date.");
    }
    throw error;
  }
}

export async function removeClinicClosure(id: string, userId: string) {
  return appointmentTransaction(async (tx) => {
    const row = await tx.blockedDate.findFirst({ where: { id, dentistId: null } });
    if (!row) throw new ConfigurationError("Clinic closure not found.", 404);
    const removed = await tx.blockedDate.deleteMany({ where: { id, dentistId: null } });
    if (removed.count !== 1) throw new ConfigurationError("Clinic closure not found.", 404);
    await tx.activity.create({ data: {
      action: "Clinic closure removed", entity: "BlockedDate", entityId: id, userId,
      description: JSON.stringify(closureData(row)),
    } });
    return { deleted: true, id };
  });
}
