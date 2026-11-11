import type { JWT } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { getRequestTenant, type RequestTenant } from "@/lib/tenant";

export function isDemoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DEMO_MODE === "true" && !!env.DEMO_TENANT_SLUG;
}

export function isDemoEmail(email: string | null | undefined): boolean {
  return !!email && ["demo@aetherdental.ph", process.env.DEMO_EMAIL]
    .some((reserved) => reserved?.trim().toLowerCase() === email.trim().toLowerCase());
}

// Refresh on every auth() call so an existing JWT cannot preserve revoked access.
export async function refreshAuthToken(token: JWT, tenant?: RequestTenant): Promise<JWT | null> {
  if (!token.id || (token.isDemo && !isDemoEnabled())) return null;
  const clinic = tenant ?? await getRequestTenant();
  if (!clinic.active || token.tenantId !== clinic.id) return null;
  const account = await prisma.user.findUnique({
    where: { id: token.id, tenantId: clinic.id },
    select: { id: true, name: true, email: true, role: true, active: true, sessionVersion: true, tenantId: true },
  });
  if (!account?.active || account.tenantId !== clinic.id) return null;
  if ((token.sessionVersion ?? 0) !== (account.sessionVersion ?? 0)) return null;
  const isDemo = token.isDemo === true || isDemoEmail(account.email);
  if (isDemo && (!isDemoEnabled() || clinic.slug !== process.env.DEMO_TENANT_SLUG)) return null;
  return { ...token, id: account.id, tenantId: clinic.id, name: account.name, email: account.email, role: account.role, isDemo };
}
