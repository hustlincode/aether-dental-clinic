import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { CalendarCheck, CalendarClock, CheckCircle2, Users } from "lucide-react";
import { addDaysToKey, clinicDateKey, dateKeyToUtc } from "@/lib/clinic-time";
import { DashboardCharts } from "@/components/admin/dashboard-charts";
import { NeedsConfirmationPanel } from "@/components/admin/needs-confirmation-panel";
import { PageContainer } from "@/components/admin/page-container";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { processUpcomingAppointmentReminders } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user;

  // Clinic-local calendar boundaries. Appointment.appointmentDate is stored as
  // a UTC-midnight @db.Date key, so "today" must come from the Asia/Manila
  // calendar date and be mapped back to the stored UTC-midnight value. Using
  // the server's local midnight instead is off by one on a UTC+8 machine
  // (00:00 local maps to the previous UTC date), which is why clinic-time
  // exists. See src/lib/clinic-time.ts.
  const todayKey = clinicDateKey();
  const today = dateKeyToUtc(todayKey);
  const tomorrow = dateKeyToUtc(addDaysToKey(todayKey, 1));
  const monthStart = dateKeyToUtc(`${todayKey.slice(0, 7)}-01`);

  // Role scoping for dentists
  let dentistId: string | undefined;
  if (user.role === "DENTIST" && user.email) {
    const assigned = await prisma.dentist.findFirst({ where: { email: user.email } });
    dentistId = assigned?.id;
  }
  const dentistFilter = dentistId ? { dentistId } : {};

  const canManage = user.role === "ADMIN" || user.role === "RECEPTIONIST";

  // In-app appointment reminders for tomorrow. This is separate from Needs
  // Confirmation, which is an explicit on-demand check triggered by staff.
  if (canManage) {
    try {
      await processUpcomingAppointmentReminders();
    } catch (err) {
      console.error("Background reminder processing failed:", err);
    }
  }

  const [todayCount, upcomingCount, totalPatients, completedThisMonth] = await Promise.all([
    prisma.appointment.count({ where: { appointmentDate: today, ...dentistFilter } }),
    prisma.appointment.count({
      where: {
        appointmentDate: { gte: today },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        ...dentistFilter,
      },
    }),
    prisma.patient.count(),
    prisma.appointment.count({
      where: {
        appointmentDate: { gte: monthStart },
        status: "COMPLETED",
        ...dentistFilter,
      },
    }),
  ]);

  // Analytics by status
  const statusGroups = await prisma.appointment.groupBy({
    by: ["status"],
    _count: { _all: true },
    where: { ...dentistFilter },
  });

  // Analytic aggregates for the dashboard charts.
  // Statuses are zero-filled so every chart slice is always present.
  const STATUS_ORDER = ["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;
  const statusCounts = STATUS_ORDER.map((name) => ({
    name,
    value: statusGroups.find((g) => g.status === name)?._count._all ?? 0,
  }));

  // Appointments per clinic-local calendar day for the last 7 days (including today).
  const weekStart = dateKeyToUtc(addDaysToKey(todayKey, -6));

  const dailyGroups = await prisma.appointment.groupBy({
    by: ["appointmentDate"],
    _count: { _all: true },
    where: {
      appointmentDate: { gte: weekStart, lt: tomorrow },
      ...dentistFilter,
    },
  });
  const countsByDate = new Map(
    dailyGroups.map((g) => [g.appointmentDate.toISOString().slice(0, 10), g._count._all]),
  );
  const dailyCounts: { label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const key = addDaysToKey(todayKey, -i);
    dailyCounts.push({ label: format(dateKeyToUtc(key), "EEE M/d"), count: countsByDate.get(key) ?? 0 });
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description={`Welcome back, ${user.name}. Here's what's happening today at the clinic.`}
      />

      {/* Stat cards */}
      <div className="grid gap-4 animate-fade-in sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's Appointments"
          value={todayCount}
          icon={CalendarCheck}
          tone="accent"
          hint="Scheduled for today"
        />
        <StatCard
          label="Upcoming"
          value={upcomingCount}
          icon={CalendarClock}
          tone="info"
          hint="Not cancelled or no-show"
        />
        <StatCard
          label="Total Patients"
          value={totalPatients}
          icon={Users}
          tone="neutral"
          hint="All time"
        />
        <StatCard
          label="Completed This Month"
          value={completedThisMonth}
          icon={CheckCircle2}
          tone="success"
          hint="Month to date"
        />
      </div>

      {/* Analytics charts */}
      <DashboardCharts daily={dailyCounts} status={statusCounts} />

      {/* On-demand confirmation check */}
      {canManage && <NeedsConfirmationPanel />}
    </PageContainer>
  );
}
