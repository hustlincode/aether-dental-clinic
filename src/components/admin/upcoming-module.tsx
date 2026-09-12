import { Construction } from "lucide-react";
import { PageContainer } from "@/components/admin/page-container";
import { PageHeader } from "@/components/admin/page-header";

export function UpcomingModule({ title, description }: { title: string; description: string }) {
  return (
    <PageContainer>
      <PageHeader title={title} />
      <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface py-20 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-background-alt text-text-muted">
          <Construction className="h-7 w-7" strokeWidth={1.5} aria-hidden />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-text">Coming soon</h2>
        <p className="mt-1 max-w-sm text-sm text-text-muted">{description}</p>
      </div>
    </PageContainer>
  );
}
