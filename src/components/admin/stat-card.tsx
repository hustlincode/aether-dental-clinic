import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

export type StatTone = "accent" | "success" | "warning" | "error" | "info" | "neutral";

const TONE_STYLES: Record<StatTone, { icon: string; value: string }> = {
  accent: { icon: "bg-accent-soft text-accent", value: "text-text" },
  success: { icon: "bg-success-bg text-success", value: "text-success" },
  warning: { icon: "bg-warning-bg text-warning", value: "text-warning" },
  error: { icon: "bg-error-bg text-error", value: "text-error" },
  info: { icon: "bg-info-bg text-info", value: "text-info" },
  neutral: { icon: "bg-neutral-bg text-neutral-c", value: "text-text" },
};

export interface StatCardProps {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  hint?: string;
  tone?: StatTone;
  className?: string;
  /** Optional destination. When set, the whole tile becomes a link. */
  href?: string;
}

/**
 * KPI tile. Surfaces use the canonical card chrome; the accent is applied to
 * the value/icon only so the palette stays intact. When `href` is provided the
 * entire tile renders as a link so stats can drill into filtered views.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "accent",
  className,
  href,
}: StatCardProps) {
  const styles = TONE_STYLES[tone];
  const inner = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
        <p className={cn("mt-2 text-3xl font-bold tabular-nums", styles.value)}>{value}</p>
        {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
      </div>
      {Icon && (
        <span
          className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", styles.icon)}
          aria-hidden
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={`View ${label}`}
        className={cn(
          "card-surface card-surface-hover block p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          className,
        )}
      >
        {inner}
      </Link>
    );
  }

  return <div className={cn("card-surface card-surface-hover p-5", className)}>{inner}</div>;
}
