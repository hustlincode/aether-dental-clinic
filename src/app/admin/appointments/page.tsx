import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppointmentsList } from "@/components/admin/appointments-list";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AdminAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user;

  // Deep link support: /admin/appointments?date=YYYY-MM-DD (used by the
  // dashboard "Today's Appointments" card) pre-selects the date filter.
  const sp = await searchParams;
  const initialDateKey = sp.date && DATE_RE.test(sp.date) ? sp.date : undefined;

  // Note: `key` intentionally remounts the list when the ?date deep link
  // changes. App Router reuses the mounted client component across soft
  // navigations (and browser back/forward) that only differ in search params,
  // which would otherwise keep a stale "All dates" selection alive and fetch
  // every appointment instead of the requested day.
  return (
    <AppointmentsList
      key={initialDateKey ?? "all"}
      role={user.role}
      initialDateKey={initialDateKey}
    />
  );
}