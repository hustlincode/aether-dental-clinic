import { SectionCard } from "@/components/admin/section-card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardChartsLoading() {
  return (
    <section aria-label="Loading analytics" role="status">
      <h2 className="text-lg font-semibold text-text">Analytics</h2>
      <div className="mt-3 grid items-stretch gap-6 lg:grid-cols-2" aria-hidden="true">
        {[0, 1].map((i) => (
          <SectionCard key={i}>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-4 h-64 w-full" />
            {i === 1 && <Skeleton className="mt-4 h-26 w-full" />}
          </SectionCard>
        ))}
      </div>
    </section>
  );
}
