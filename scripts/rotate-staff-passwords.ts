/**
 * scripts/rotate-staff-passwords.ts
 *
 * One-time security action for deployments that were seeded with the old
 * default passwords (admin123 / reception123 / dentist123): generates a strong
 * random password for every staff account (ADMIN, RECEPTIONIST, DENTIST) and
 * prints them once. The passwordless demo account is skipped — it can only be
 * reached through the read-only demo provider.
 *
 * Usage: npm run security:rotate-passwords
 * Requires DATABASE_URL in .env (loaded below).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

async function main() {
  const demoEmail = (process.env.DEMO_EMAIL || "demo@aetherdental.ph").toLowerCase();

  const users = await prisma.user.findMany({ orderBy: { email: "asc" } });
  const rotated: { email: string; role: string; password: string }[] = [];
  const skipped: string[] = [];

  for (const user of users) {
    if (user.email.toLowerCase() === demoEmail) {
      skipped.push(user.email);
      continue;
    }
    const password = randomBytes(12).toString("base64url");
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: bcrypt.hashSync(password, 10) },
    });
    rotated.push({ email: user.email, role: user.role, password });
  }

  if (rotated.length === 0) {
    console.log("No staff accounts found. Run `npx prisma db seed` first.");
    return;
  }

  console.log("Rotated staff passwords (shown only once — store them safely):\n");
  for (const row of rotated) {
    console.log(`  ${row.email}  [${row.role}]  ->  ${row.password}`);
  }
  if (skipped.length > 0) {
    console.log(`\nSkipped demo account(s) (passwordless read-only access): ${skipped.join(", ")}`);
  }
  console.log("\nReminder: this invalidates every existing staff session's credentials.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
