import { getServerSession } from "@/lib/server-session";
import { redirect } from "next/navigation";
import { PatientsManager } from "@/components/admin/patients-manager";

export const dynamic = "force-dynamic";

export default async function AdminPatientsPage() {
  const session = await getServerSession();
  if (!session?.user) redirect("/login");
  const user = session.user;

  return <PatientsManager role={user.role} />;
}
