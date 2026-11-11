import { rawPrisma } from "@/lib/raw-db";
import { createTenantClient } from "@/lib/tenant-db";
import { getRequestTenant } from "@/lib/tenant";

export const prisma = createTenantClient(rawPrisma, () => getRequestTenant());
