import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { CalendarView } from "@/components/admin/calendar-view";

export const dynamic = "force-dynamic";

export default async function AdminCalendarPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <h1 className="text-2xl font-bold text-text">Calendar</h1>
      <p className="mt-1 text-sm text-text-secondary">
        View and manage appointments on the calendar.
      </p>

      <div className="mt-6 animate-fade-in">
        <CalendarView />
      </div>
    </div>
  );
}
