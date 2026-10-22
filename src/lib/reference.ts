import { randomUUID } from "node:crypto";

export async function generateAppointmentReference(date: Date = new Date()): Promise<string> {
  return `APT-${date.getUTCFullYear()}-${randomUUID()}`;
}
