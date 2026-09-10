import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NotificationsHistory } from "@/components/admin/notifications-history";

export const metadata = { title: "Aether Dental — Notifications" };

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text">Notifications</h1>
        <p className="text-sm text-text-muted">Important events that need your attention.</p>
      </div>
      <NotificationsHistory />
    </div>
  );
}