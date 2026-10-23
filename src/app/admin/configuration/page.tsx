import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ConfigurationManager } from "@/components/admin/configuration-manager";

export default async function AdminConfigurationPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/admin");
  return <ConfigurationManager readOnly={session.user.isDemo === true} />;
}
