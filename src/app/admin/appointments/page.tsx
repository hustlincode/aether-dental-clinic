import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppointmentsList } from "@/components/admin/appointments-list";

export const dynamic = "force-dynamic";

export default async function AdminAppointmentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user;

  return <AppointmentsList role={user.role} />;
}
