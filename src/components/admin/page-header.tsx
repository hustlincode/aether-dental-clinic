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
          <p className="font-mono text-eyebrow uppercase text-accent">
            {eyebrow}
          </p>
        )}
        {/* Left on `text-2xl font-bold tracking-tight`: `text-title-lg` is the
            same 1.5rem size but a different weight/leading, which would shift
            every admin page header's vertical rhythm. Not required by P3. */}
        <h1 className="text-2xl font-bold tracking-tight text-text">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
