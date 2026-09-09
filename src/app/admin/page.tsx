import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/admin/status-badge";

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

  const [
    todayCount,
    upcomingCount,
    totalPatients,
    completedThisMonth,
    todayAppointments,
  ] = await Promise.all([
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
    prisma.appointment.findMany({
      where: { appointmentDate: today, status: { notIn: ["CANCELLED", "NO_SHOW"] }, ...dentistFilter },
      include: { patient: true, dentist: true, service: true },
      orderBy: { startTime: "asc" },
    }),
  ]);

  // Analytics by status
  const statusGroups = await prisma.appointment.groupBy({
    by: ["status"],
    _count: { _all: true },
    where: { ...dentistFilter },
  });

  // Popular services
  const popularServices = await prisma.appointment.groupBy({
    by: ["serviceId"],
    _count: { _all: true },
    where: { ...dentistFilter },
    orderBy: { _count: { serviceId: "desc" } },
    take: 5,
  });
  const serviceIds = popularServices.map((s) => s.serviceId);
  const services = await prisma.service.findMany({ where: { id: { in: serviceIds } } });
  const serviceMap = new Map(services.map((s) => [s.id, s.name]));

  return (
    <div>
      <h1 className="text-2xl font-bold text-text">Dashboard</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Welcome back, {user.name}. Here&apos;s what&apos;s happening today at the clinic.
      </p>

      {/* Stat cards */}
      <div className="mt-6 grid gap-4 animate-fade-in sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today's Appointments" value={todayCount} />
        <StatCard label="Upcoming" value={upcomingCount} />
        <StatCard label="Total Patients" value={totalPatients} />
        <StatCard label="Completed This Month" value={completedThisMonth} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Today's schedule */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-text">Today&apos;s Schedule</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface shadow">
            {todayAppointments.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-text-muted">
                No appointments scheduled for today.
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-background-alt text-xs uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Time</th>
                    <th className="px-4 py-3 font-semibold">Patient</th>
                    <th className="hidden px-4 py-3 font-semibold sm:table-cell">Dentist</th>
                    <th className="hidden px-4 py-3 font-semibold sm:table-cell">Service</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {todayAppointments.map((a) => (
                    <tr key={a.id} className="hover:bg-accent-soft transition-colors">
                      <td className="px-4 py-3 font-medium text-text">{fmtTime(a.startTime)}</td>
                      <td className="px-4 py-3 text-text">
                        {a.patient.firstName} {a.patient.lastName}
                      </td>
                      <td className="hidden px-4 py-3 text-text-secondary sm:table-cell">{a.dentist.name}</td>
                      <td className="hidden px-4 py-3 text-text-secondary sm:table-cell">{a.service.name}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Analytics */}
        <div>
          <h2 className="text-lg font-semibold text-text">Appointments Analytics</h2>
          <div className="mt-3 rounded-xl border border-border bg-surface p-5 shadow">
            {statusGroups.map((g) => {
              const total = statusGroups.reduce((s, x) => s + x._count._all, 0) || 1;
              const pct = Math.round((g._count._all / total) * 100);
              return (
                <div key={g.status} className="mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-text">{g.status.replace("_", " ")}</span>
                    <span className="text-text-muted">{g._count._all}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-background-alt">
                    <div className={`h-full rounded-full ${barColor(g.status)}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Popular services */}
          <h2 className="mt-6 text-lg font-semibold text-text">Popular Services</h2>
          <div className="mt-3 rounded-xl border border-border bg-surface p-5 shadow">
            {popularServices.length === 0 ? (
              <p className="text-sm text-text-muted">No data yet.</p>
            ) : (
              popularServices.map((s, i) => (
                <div key={s.serviceId} className="flex items-center justify-between border-b border-border py-2 last:border-0">
                  <span className="text-sm text-text">
                    <span className="mr-2 text-xs text-text-muted">{i + 1}.</span>
                    {serviceMap.get(s.serviceId) || "Service"}
                  </span>
                  <span className="text-sm font-semibold text-accent">{s._count._all}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const p = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${p}`;
}

function barColor(status: string) {
  switch (status) {
    case "COMPLETED": return "bg-success";
    case "CONFIRMED": return "bg-info";
    case "PENDING": return "bg-warning";
    case "CANCELLED": return "bg-error";
    case "NO_SHOW": return "bg-neutral-c";
    case "CHECKED_IN": return "bg-accent";
    default: return "bg-neutral-c";
  }
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-l-4 border-l-accent border-border bg-surface p-5 shadow">
      <div className="text-3xl font-bold text-accent">{value}</div>
      <div className="mt-1 text-sm text-text-muted">{label}</div>
    </div>
  );
}