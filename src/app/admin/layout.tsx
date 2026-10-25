import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/server-session";
import { AdminShell } from "@/components/admin/admin-shell";
import { NotificationsProvider } from "@/components/admin/notifications-provider";

export const metadata = { title: "Aether Dental — Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session?.user) {
    redirect("/login");
  }
  const user = session.user;

  if (!user) {
    redirect("/login");
  }

  const role = (user.role || "RECEPTIONIST") as string;
  const name = user.name || "Staff";
  const isDemo = user.isDemo === true;

  const navItems = [
    { href: "/admin", label: "Dashboard", roles: ["ADMIN", "RECEPTIONIST", "DENTIST"], group: "Overview" },
    { href: "/admin/appointments", label: "Appointments", roles: ["ADMIN", "RECEPTIONIST", "DENTIST"], group: "Clinic" },
    { href: "/admin/calendar", label: "Calendar", roles: ["ADMIN", "RECEPTIONIST", "DENTIST"], group: "Clinic" },
    { href: "/admin/patients", label: "Patients", roles: ["ADMIN", "RECEPTIONIST", "DENTIST"], group: "Clinic" },
    { href: "/admin/dentists", label: "Dentists", roles: ["ADMIN"], group: "Clinic" },
    { href: "/admin/services", label: "Services", roles: ["ADMIN"], group: "Clinic" },
    { href: "/admin/configuration", label: "Configuration", roles: ["ADMIN"], group: "Clinic" },
    { href: "/admin/reports", label: "Reports", roles: ["ADMIN"], group: "Insights" },
    { href: "/admin/notifications", label: "Notifications", roles: ["ADMIN", "RECEPTIONIST", "DENTIST"], group: "Insights" },
  ].filter((n) => n.roles.includes(role));

  return (
    <NotificationsProvider key={user.id} isDemo={isDemo}>
      <AdminShell navItems={navItems} user={{ name, role, isDemo }}>
        {children}
      </AdminShell>
    </NotificationsProvider>
  );
}
