import type { PrismaClient } from "@prisma/client";
import { assertSubscriptionWrite, type SubscriptionTenant } from "@/lib/subscription";

const relations: Record<string, string[]> = {
  User: ["tenant", "activities", "createdAppointments", "notifications", "confirmationEmailsSent", "dentist"],
  Patient: ["tenant", "appointments", "confirmationEmails"],
  Dentist: ["tenant", "user", "appointments", "availability", "blockedDates"],
  Service: ["tenant", "appointments"],
  Appointment: ["tenant", "patient", "dentist", "service", "createdBy", "activities", "confirmationEmails"],
  ConfirmationEmail: ["tenant", "appointment", "patient", "sentBy"],
  Availability: ["tenant", "dentist"],
  BlockedDate: ["tenant", "dentist"],
  ClinicSetting: ["tenant"],
  Notification: ["tenant", "user"],
  Activity: ["tenant", "user", "appointment"],
  EmailLog: ["tenant"],
};
const reads = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy"]);
const creates = new Set(["create", "createMany", "createManyAndReturn"]);
const updates = new Set(["update", "updateMany", "updateManyAndReturn"]);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid tenant query arguments.");
  return value as Record<string, unknown>;
}

/** Restrict the shared client to tenant-owned models and flat, tenant-owned writes. */
export function scopeTenantQuery(model: string | undefined, operation: string, input: unknown, tenantId: string) {
  if (!tenantId || !model || !relations[model]) throw new Error("Unscoped database access is prohibited.");
  const args = { ...record(input ?? {}) };
  const data = (value: unknown, create: boolean) => {
    const row = { ...record(value) };
    if (row.tenantId !== undefined && row.tenantId !== tenantId) throw new Error("Tenant ownership cannot be changed.");
    if (relations[model].some(key => key in row)) {
      // Nested writes bypass Prisma query extensions; use separately scoped writes in a transaction.
      throw new Error("Nested writes are prohibited on the tenant client.");
    }
    if (create) row.tenantId = tenantId;
    else delete row.tenantId;
    return row;
  };
  if (reads.has(operation) || updates.has(operation) || operation === "delete" || operation === "deleteMany" || operation === "upsert") {
    args.where = { ...(args.where ? record(args.where) : {}), tenantId };
  }
  if (creates.has(operation)) {
    args.data = Array.isArray(args.data) ? args.data.map(row => data(row, true)) : data(args.data, true);
  } else if (updates.has(operation)) {
    args.data = data(args.data, false);
  } else if (operation === "upsert") {
    args.create = data(args.create, true);
    args.update = data(args.update, false);
  } else if (!reads.has(operation) && operation !== "delete" && operation !== "deleteMany") {
    throw new Error("Unsupported tenant database operation.");
  }
  return args;
}

export function createTenantClient(client: PrismaClient, resolveTenant: () => Promise<{ id: string } & SubscriptionTenant>): PrismaClient {
  return client.$extends({
    name: "tenant-isolation",
    query: {
      async $allOperations({ model, operation, args, query }) {
        const tenant = await resolveTenant();
        if (creates.has(operation) || updates.has(operation) || ["upsert", "delete", "deleteMany"].includes(operation)) {
          assertSubscriptionWrite(tenant);
        }
        return query(scopeTenantQuery(model, operation, args, tenant.id) as typeof args);
      },
    },
  }) as unknown as PrismaClient;
}
