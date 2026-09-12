import { PageContainer } from "@/components/admin/page-container";
import { SectionCard } from "@/components/admin/section-card";
import { TableSkeleton } from "@/components/admin/table-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level loading fallback for all /admin pages. Kept intentionally
 * neutral (header + content surface) since it also covers pages without KPIs.
 */
export default function AdminLoading() {
  return (
    <PageContainer>
      <div>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>

      <SectionCard padded={false}>
        <TableSkeleton rows={7} columns={4} />
      </SectionCard>
    </PageContainer>
  );
}
