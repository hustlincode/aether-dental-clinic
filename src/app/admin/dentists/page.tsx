import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { DentistsManager } from "@/components/admin/dentists-manager";

export const dynamic = "force-dynamic";

export default async function AdminDentistsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/admin");

  return <DentistsManager role={session.user.role} />;
}