import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";
import { z } from "zod";

export const tenantProvisionSchema = z.object({
  slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
    .refine(value => !["www", "admin", "api", "auth", "localhost"].includes(value), "Choose a clinic subdomain."),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  adminName: z.string().trim().min(1).max(100),
  password: z.string().min(12).refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password must be at most 72 UTF-8 bytes."),
}).strict();

export async function provisionTenant(client: Pick<PrismaClient, "$transaction">, input: unknown, now = new Date()) {
  const data = tenantProvisionSchema.parse(input);
  const passwordHash = await bcrypt.hash(data.password, 12);
  // A duplicate slug fails instead of overwriting an existing clinic or administrator.
  return client.$transaction(async tx => {
    const tenant = await tx.tenant.create({ data: {
      slug: data.slug, name: data.name, subscriptionMode: "TRIAL",
      subscriptionEndsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    } });
    await tx.clinicSetting.create({ data: {
      tenantId: tenant.id, name: data.name, email: data.email,
      openingTime: "09:00", closingTime: "17:00", defaultDurationMin: 30,
    } });
    await tx.user.create({ data: {
      tenantId: tenant.id, name: data.adminName, email: data.email, passwordHash, role: Role.ADMIN,
    } });
    return { id: tenant.id, slug: tenant.slug };
  });
}

async function main() {
  const [slug, name, email, adminName, ...extra] = process.argv.slice(2);
  if (!slug || !name || !email || !adminName || extra.length || process.stdin.isTTY) {
    throw new Error("Usage: tsx scripts/provision-tenant.ts <slug> <clinic-name> <admin-email> <admin-name>; supply the password through stdin, never as an argument.");
  }
  let password = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    password += chunk;
    if (Buffer.byteLength(password, "utf8") > 74) throw new Error("Password must be at most 72 UTF-8 bytes.");
  }
  password = password.replace(/\r?\n$/, "");
  const client = new PrismaClient();
  try {
    const tenant = await provisionTenant(client, { slug, name, email, adminName, password });
    console.log(`Provisioned clinic ${tenant.slug} (${tenant.id}).`);
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Validation or database errors may contain input; do not print credentials.
    console.error("Clinic provisioning failed. Check inputs, duplicate subdomains, database connectivity, and applied migrations.");
    process.exitCode = 1;
  });
}
