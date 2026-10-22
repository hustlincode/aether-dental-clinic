import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export class AppointmentError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

// PostgreSQL SSI protects interval reads from concurrent inserts across app instances.
export async function appointmentTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") throw error;
      if (attempt === 4) throw new AppointmentError("The schedule is busy. Please refresh and try again.");
    }
  }
}
