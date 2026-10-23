import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}

/**
 * Canonical page header used by every admin route.
 * Keeps title size, description color and action alignment consistent.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          // Mono micro-label, same idiom as StatCard's label and the homepage
          // `.home-eyebrow`. `text-eyebrow` carries size/tracking/weight.
          <p className="mb-1 font-mono text-eyebrow uppercase text-text-muted">
            {eyebrow}
          </p>
        )}
        <h1 className="text-title-lg text-text">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-body-sm text-text-secondary">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
