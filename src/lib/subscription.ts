export interface SubscriptionTenant {
  subscriptionMode?: string;
  subscriptionEndsAt?: Date | null;
}

export const SUBSCRIPTION_READ_ONLY_MESSAGE =
  "Your clinic subscription has expired. Existing records remain available in read-only mode. Contact your service provider to renew.";

export function subscriptionAccess(tenant: SubscriptionTenant, now = new Date()) {
  if (tenant.subscriptionMode === "INTERNAL") {
    return { status: "INTERNAL" as const, canWrite: true, endsAt: null };
  }
  const end = tenant.subscriptionEndsAt;
  const validEnd = end instanceof Date && Number.isFinite(end.getTime()) ? end : null;
  const recognized = tenant.subscriptionMode === "TRIAL" || tenant.subscriptionMode === "PAID";
  const canWrite = recognized && validEnd !== null && validEnd.getTime() > now.getTime();
  return {
    status: canWrite ? tenant.subscriptionMode === "TRIAL" ? "TRIAL" as const : "ACTIVE" as const : "EXPIRED" as const,
    canWrite,
    endsAt: validEnd,
  };
}

export class SubscriptionReadOnlyError extends Error {
  readonly code = "SUBSCRIPTION_READ_ONLY";
  constructor() {
    super(SUBSCRIPTION_READ_ONLY_MESSAGE);
    this.name = "SubscriptionReadOnlyError";
  }
}

export function assertSubscriptionWrite(tenant: SubscriptionTenant, now = new Date()): void {
  if (!subscriptionAccess(tenant, now).canWrite) throw new SubscriptionReadOnlyError();
}
