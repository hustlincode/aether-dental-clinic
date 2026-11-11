import { cache } from "react";
import { AsyncLocalStorage } from "node:async_hooks";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { rawPrisma } from "@/lib/raw-db";
import { tenantSlugFromHeaders } from "@/lib/tenant-host";

export interface RequestTenant {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  subscriptionMode: "INTERNAL" | "TRIAL" | "PAID";
  subscriptionEndsAt: Date | null;
}

const tenantContext = new AsyncLocalStorage<RequestTenant>();

/** Carry an already resolved clinic into background work without reading request headers. */
export function withTenantContext<T>(tenant: RequestTenant, work: () => Promise<T>): Promise<T> {
  if (!tenant.id || !tenant.active) throw new Error("An active clinic is required.");
  return tenantContext.run(tenant, async () => await work());
}

// React's cache is request-local; never share clinic resolution across hosts.
export const getRequestTenant = cache(async (): Promise<RequestTenant> => {
  const captured = tenantContext.getStore();
  if (captured) return captured;
  const slug = tenantSlugFromHeaders(await headers());
  if (!slug) notFound();
  const tenant = await rawPrisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, active: true, subscriptionMode: true, subscriptionEndsAt: true },
  });
  if (!tenant?.active) notFound();
  return tenant;
});
