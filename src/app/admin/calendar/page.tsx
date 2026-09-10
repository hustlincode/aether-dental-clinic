import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { CalendarView } from "@/components/admin/calendar-view";

/* FullCalendar CSS — verified from installed packages:
 *  @fullcalendar/react v7.1.0 ships skeleton.css + theme CSS in themes/*
 *  @fullcalendar/core|daygrid|timegrid v6.1.21 ship NO CSS files.
 */
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import "./calendar.css";

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
