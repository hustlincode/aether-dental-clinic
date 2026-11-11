import { cache } from "react";
import { auth } from "@/auth";
import { getRequestTenant } from "@/lib/tenant";

// Share one session read within an RSC render; React resets this cache for every request.
export const getServerSession = cache(async () => {
  const session = await auth();
  if (!session?.user) return null;
  const tenant = await getRequestTenant();
  return session.user.tenantId === tenant.id ? session : null;
});
