import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NotificationsHistory } from "@/components/admin/notifications-history";
import { PageContainer } from "@/components/admin/page-container";
import { PageHeader } from "@/components/admin/page-header";

export const metadata = { title: "Aether Dental — Notifications" };

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Insights"
        title="Notifications"
        description="Important events that need your attention."
      />
      <NotificationsHistory />
    </PageContainer>
  );
}