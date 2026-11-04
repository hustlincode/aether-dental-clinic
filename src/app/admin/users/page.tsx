import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/server-session";
import { UsersManager } from "@/components/admin/users-manager";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getServerSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/admin");
  return <UsersManager isDemo={session.user.isDemo === true} />;
}
