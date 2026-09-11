import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { FollowUpsPanel } from "@/components/admin/follow-ups-panel";
import { DashboardCharts } from "@/components/admin/dashboard-charts";
import { processDueFollowUps, getPendingFollowUpCount } from "@/lib/followups";
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

  // Automation: flush due follow-up emails when an admin/receptionist opens the
  // dashboard (SCHEDULED follow-ups whose scheduledFor has passed are sent).
  // Appointment reminders for tomorrow are also generated here.
  if (user.role === "ADMIN" || user.role === "RECEPTIONIST") {
    try {
      await processDueFollowUps();
    } catch (err) {
      console.error("Background follow-up processing failed:", err);
    }
    try {
      await processUpcomingAppointmentReminders();
    } catch (err) {
      console.error("Background reminder processing failed:", err);
    }
  }

  const [todayCount, upcomingCount, totalPatients, completedThisMonth, pendingFollowUps] = await Promise.all([
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
    getPendingFollowUpCount(),
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
    <div>
      <h1 className="text-2xl font-bold text-text">Dashboard</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Welcome back, {user.name}. Here&apos;s what&apos;s happening today at the clinic.
      </p>

      {/* Stat cards */}
      <div className="mt-6 grid gap-4 animate-fade-in sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Today's Appointments" value={todayCount} />
        <StatCard label="Upcoming" value={upcomingCount} />
        <StatCard label="Total Patients" value={totalPatients} />
        <StatCard label="Completed This Month" value={completedThisMonth} />
        <StatCard label="Follow-ups Pending" value={pendingFollowUps} />
      </div>

      {/* Analytics charts */}
      <DashboardCharts daily={dailyCounts} status={statusCounts} />

      {/* Follow-ups */}
      <FollowUpsPanel role={user.role} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-l-4 border-l-accent border-border bg-surface p-5 shadow">
      <div className="text-3xl font-bold text-accent">{value}</div>
      <div className="mt-1 text-sm text-text-muted">{label}</div>
    </div>
  );
}