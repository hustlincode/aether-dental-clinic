import { PrismaClient } from "@prisma/client";

// Infrastructure only: request code must import the tenant-scoped client from db.ts.
const globalForPrisma = globalThis as unknown as { rawPrisma?: PrismaClient };
export const rawPrisma = globalForPrisma.rawPrisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
if (process.env.NODE_ENV !== "production") globalForPrisma.rawPrisma = rawPrisma;
