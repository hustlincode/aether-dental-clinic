import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PatientsManager } from "@/components/admin/patients-manager";

export const dynamic = "force-dynamic";

export default async function AdminPatientsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user;

  return <PatientsManager role={user.role} />;
}