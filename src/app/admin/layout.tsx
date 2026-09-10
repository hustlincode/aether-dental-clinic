import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata = { title: "Aether Dental — Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const user = session.user;

  if (!user) {
    redirect("/login");
  }

  const role = (user.role || "RECEPTIONIST") as string;
  const name = user.name || "Staff";

  const navItems = [
    { href: "/admin", label: "Dashboard", roles: ["ADMIN", "RECEPTIONIST", "DENTIST"] },
    { href: "/admin/appointments", label: "Appointments", roles: ["ADMIN", "RECEPTIONIST", "DENTIST"] },
    { href: "/admin/calendar", label: "Calendar", roles: ["ADMIN", "RECEPTIONIST", "DENTIST"] },
    { href: "/admin/patients", label: "Patients", roles: ["ADMIN", "RECEPTIONIST", "DENTIST"] },
    { href: "/admin/dentists", label: "Dentists", roles: ["ADMIN"] },
    { href: "/admin/services", label: "Services", roles: ["ADMIN"] },
    { href: "/admin/reports", label: "Reports", roles: ["ADMIN"] },
    { href: "/admin/notifications", label: "Notifications", roles: ["ADMIN", "RECEPTIONIST", "DENTIST"] },
  ].filter((n) => n.roles.includes(role));

  return (
    <AdminShell navItems={navItems} user={{ name, role }}>
      {children}
    </AdminShell>
  );
}
