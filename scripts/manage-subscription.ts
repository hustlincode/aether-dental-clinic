import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { tenantProvisionSchema } from "./provision-tenant";

const slug = tenantProvisionSchema.shape.slug;
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), slug }).strict(),
  z.object({ action: z.literal("renew"), slug, months: z.number().int().min(1).max(12) }).strict(),
  z.object({ action: z.literal("expire"), slug }).strict(),
]);

export function parseSubscriptionArgs(args: string[]) {
  const [action, tenantSlug, months, ...extra] = args;
  if (extra.length || (action !== "renew" && months !== undefined)) {
    throw new Error("Usage: manage-subscription status <slug> | renew <slug> <months:1..12> | expire <slug>");
  }
  return commandSchema.parse({ action, slug: tenantSlug, ...(months === undefined ? {} : { months: Number(months) }) });
}

// UTC calendar months preserve the time and clamp Jan 31 to February's last day.
function addUtcMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return result;
}

const subscriptionSelect = {
  id: true, slug: true, active: true, subscriptionMode: true, subscriptionEndsAt: true,
} satisfies Prisma.TenantSelect;

export async function manageSubscription(client: Pick<PrismaClient, "$transaction">, input: unknown, now = new Date()) {
  const command = commandSchema.parse(input);
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.$transaction(async tx => {
        const tenant = await tx.tenant.findUnique({ where: { slug: command.slug }, select: subscriptionSelect });
        if (!tenant) throw new Error("Clinic not found.");
        if (command.action === "status") return tenant;
        if (tenant.subscriptionMode === "INTERNAL") throw new Error("Internal clinic subscriptions cannot be changed.");

        const currentEnd = tenant.subscriptionEndsAt;
        const subscriptionEndsAt = command.action === "renew"
          ? addUtcMonths(currentEnd && currentEnd > now ? currentEnd : now, command.months)
          : now;
        const subscriptionMode = command.action === "renew" ? "PAID" : tenant.subscriptionMode;
        const updated = await tx.tenant.update({
          where: { id: tenant.id }, data: { subscriptionMode, subscriptionEndsAt }, select: subscriptionSelect,
        });
        await tx.activity.create({ data: {
          tenantId: tenant.id, action: command.action === "renew" ? "Subscription renewed" : "Subscription expired",
          entity: "Tenant", entityId: tenant.id,
          description: JSON.stringify({
            before: { mode: tenant.subscriptionMode, endsAt: currentEnd },
            after: { mode: subscriptionMode, endsAt: subscriptionEndsAt },
          }),
        } });
        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 3) throw error;
    }
  }
}

async function main() {
  const command = parseSubscriptionArgs(process.argv.slice(2));
  const client = new PrismaClient();
  try {
    console.log(JSON.stringify(await manageSubscription(client, command), null, 2));
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("Subscription command failed. Check command arguments, clinic subdomain, internal-clinic protection, and database connectivity.");
    process.exitCode = 1;
  });
}
