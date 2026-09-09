import { prisma } from "./db";

/**
 * Generates a unique appointment reference number in the format APT-YYYY-NNNN.
 * The numeric sequence is derived from the count of appointments in the current year.
 */
export async function generateAppointmentReference(date: Date = new Date()): Promise<string> {
  const year = date.getFullYear();

  let count: number;
  try {
    count = await prisma.appointment.count({
      where: {
        createdAt: {
          gte: new Date(`${year}-01-01T00:00:00.000Z`),
          lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
        },
      },
    });
  } catch {
    count = 0;
  }

  return `APT-${year}-${String(count + 1).padStart(4, "0")}`;
}
