import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/server-session";
import { ConfigurationManager } from "@/components/admin/configuration-manager";

export default async function AdminConfigurationPage() {
  const session = await getServerSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/admin");
  return <ConfigurationManager readOnly={session.user.isDemo === true} />;
}
