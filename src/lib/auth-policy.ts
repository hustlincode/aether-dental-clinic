import type { JWT } from "next-auth/jwt";
import { prisma } from "@/lib/db";

export function isDemoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.DEMO_MODE === "true";
}

export function isDemoEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() ===
    (process.env.DEMO_EMAIL || "demo@aetherdental.ph").toLowerCase();
}

// Refresh on every auth() call so an existing JWT cannot preserve revoked access.
export async function refreshAuthToken(token: JWT): Promise<JWT | null> {
  if (!token.id || (token.isDemo && !isDemoEnabled())) return null;
  const account = await prisma.user.findUnique({
    where: { id: token.id },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  if (!account?.active) return null;
  const isDemo = token.isDemo === true || isDemoEmail(account.email);
  if (isDemo && !isDemoEnabled()) return null;
  return { ...token, id: account.id, name: account.name, email: account.email, role: account.role, isDemo };
}
