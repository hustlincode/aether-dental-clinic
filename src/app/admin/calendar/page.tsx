import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { CalendarView } from "@/components/admin/calendar-view";
import { PageContainer } from "@/components/admin/page-container";
import { PageHeader } from "@/components/admin/page-header";

export const dynamic = "force-dynamic";

export default async function AdminCalendarPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Clinic"
        title="Calendar"
        description="View and manage appointments on the calendar."
      />

      <div className="animate-fade-in">
        <CalendarView />
      </div>
    </PageContainer>
  );
}
