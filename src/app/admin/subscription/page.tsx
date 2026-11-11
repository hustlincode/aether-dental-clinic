import { redirect } from "next/navigation";
import { Clock, LockKeyhole } from "lucide-react";
import { getServerSession } from "@/lib/server-session";
import { getRequestTenant } from "@/lib/tenant";
import { subscriptionAccess } from "@/lib/subscription";
import { PageContainer } from "@/components/admin/page-container";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default async function SubscriptionPage() {
  const session = await getServerSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/admin");
  const tenant = await getRequestTenant();
  const access = subscriptionAccess(tenant);
  const status = { INTERNAL: "Internal access", TRIAL: "Trial active", ACTIVE: "Active", EXPIRED: "Expired" }[access.status];
  const deadline = access.endsAt ? new Intl.DateTimeFormat("en-PH", {
    dateStyle: "long", timeStyle: "short", timeZone: "Asia/Manila",
  }).format(access.endsAt) : null;

  return (
    <PageContainer>
      <PageHeader eyebrow="Account" title="Subscription" description="Review your clinic's access and renewal details." />
      {access.status !== "INTERNAL" && (
        <Alert variant={access.canWrite ? "default" : "destructive"}>
          {access.canWrite ? <Clock aria-hidden /> : <LockKeyhole aria-hidden />}
          <AlertTitle>{access.canWrite ? "Clinic access is available" : "Your clinic is read-only"}</AlertTitle>
          <AlertDescription>
            {access.canWrite
              ? "You can continue managing your clinic until the access period ends."
              : "You can still view existing records. Changes and new bookings are paused until your access is renewed."}
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Clinic subscription" description={tenant.name} actions={<Badge variant={access.canWrite ? "secondary" : "destructive"}>{status}</Badge>}>
          <dl className="grid gap-5 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-text-muted">Access</dt>
              <dd className="font-medium text-text">{access.canWrite ? "Clinic management" : "Read-only"}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-text-muted">Access ends</dt>
              <dd className="font-medium text-text">
                {deadline && access.endsAt ? <time dateTime={access.endsAt.toISOString()}>{deadline} (Philippine time)</time> : access.status === "INTERNAL" ? "No expiry" : "No active access period"}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-text-muted">Trial period for new clinics</dt>
              <dd className="font-medium text-text">30 days</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-text-muted">Renewal</dt>
              <dd className="font-medium text-text">Arranged with your provider</dd>
            </div>
          </dl>
        </SectionCard>
        <SectionCard title="Renew your access" description="Your clinic records stay with your account.">
          <div className="flex max-w-prose flex-col gap-3 text-sm text-text-secondary">
            <p>Contact your service provider to arrange renewal. Your provider will confirm the access period and update your subscription.</p>
            <p>When access expires, your existing records remain available to view. Renewing restores changes and new bookings without starting over.</p>
          </div>
        </SectionCard>
      </div>
    </PageContainer>
  );
}
