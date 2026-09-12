import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { DentistScheduleManager } from "@/components/admin/dentist-schedule-manager";

export const dynamic = "force-dynamic";

export default async function AdminDentistSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/admin/dentists");

  const dentist = await prisma.dentist.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!dentist) notFound();

  return <DentistScheduleManager dentistId={dentist.id} dentistName={dentist.name} />;
}