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
}

/**
 * KPI tile. Surfaces use the canonical card chrome; the accent is applied to
 * the value/icon only so the palette stays intact.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "accent",
  className,
}: StatCardProps) {
  const styles = TONE_STYLES[tone];
  return (
    <div className={cn("card-surface card-surface-hover p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            {label}
          </p>
          <p className={cn("mt-2 text-3xl font-bold tabular-nums", styles.value)}>
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
        </div>
        {Icon && (
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              styles.icon,
            )}
            aria-hidden
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
          </span>
        )}
      </div>
    </div>
  );
}
