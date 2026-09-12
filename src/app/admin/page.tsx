import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { CalendarCheck, CalendarClock, CheckCircle2, Users } from "lucide-react";
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = new Date(today);
  upcoming.setHours(23, 59, 59, 999);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

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

  // Appointments per calendar day for the last 7 days (including today).
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);

  const dailyGroups = await prisma.appointment.groupBy({
    by: ["appointmentDate"],
    _count: { _all: true },
    where: {
      appointmentDate: { gte: weekStart, lte: upcoming },
      ...dentistFilter,
    },
  });
  const countsByDate = new Map(
    dailyGroups.map((g) => [g.appointmentDate.toISOString().slice(0, 10), g._count._all]),
  );
  const dailyCounts: { label: string; count: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const key = day.toISOString().slice(0, 10);
    dailyCounts.push({ label: format(day, "EEE M/d"), count: countsByDate.get(key) ?? 0 });
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
