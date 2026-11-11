/**
 * scripts/rotate-staff-passwords.ts
 *
 * One-time security action for deployments that were seeded with the old
 * default passwords (admin123 / reception123 / dentist123): generates a strong
 * random password for every staff account and
 * prints them once. The passwordless demo account is skipped — it can only be
 * reached through the read-only demo provider.
 *
 * Usage: npm run security:rotate-passwords -- <clinic-subdomain>
 * Requires DATABASE_URL in .env (loaded below).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

async function main() {
  const [slug, ...extra] = process.argv.slice(2);
  if (!slug || extra.length) throw new Error("Supply exactly one clinic subdomain; global password rotation is disabled.");
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error("Clinic not found.");
  const demoEmail = (process.env.DEMO_EMAIL || "demo@aetherdental.ph").toLowerCase();

  const users = await prisma.user.findMany({ where: { tenantId: tenant.id }, orderBy: { email: "asc" } });
  const rotated: { email: string; role: string; password: string }[] = [];
  const skipped: string[] = [];

  for (const user of users) {
    if ([demoEmail, "demo@aetherdental.ph"].includes(user.email.toLowerCase())) {
      skipped.push(user.email);
      continue;
    }
    const password = randomBytes(12).toString("base64url");
    await prisma.user.update({
      where: { id: user.id, tenantId: tenant.id },
      data: { passwordHash: bcrypt.hashSync(password, 10), sessionVersion: { increment: 1 } },
    });
    rotated.push({ email: user.email, role: user.role, password });
  }

  if (rotated.length === 0) {
    console.log("No staff accounts found for this clinic.");
    return;
  }

  console.log("Rotated staff passwords (shown only once — store them safely):\n");
  for (const row of rotated) {
    console.log(`  ${row.email}  [${row.role}]  ->  ${row.password}`);
  }
  if (skipped.length > 0) {
    console.log(`\nSkipped demo account(s) (passwordless read-only access): ${skipped.join(", ")}`);
  }
  console.log(`\nExisting staff sessions for ${tenant.slug} have been revoked.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
