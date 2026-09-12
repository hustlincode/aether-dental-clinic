import { AlertTriangle, RefreshCw, type LucideIcon } from "lucide-react";
import { cn } from "cn";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: LucideIcon;
  className?: string;
}

/** Consistent inline error with an optional retry action. */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try Again",
  icon: Icon = AlertTriangle,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-error-bg text-error">
        <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden />
      </span>
      <h3 className="mt-3 text-sm font-semibold text-text">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-text-secondary">{message}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-border-accent hover:bg-accent-soft hover:text-accent"
        >
          <RefreshCw size={14} aria-hidden />
          {retryLabel}
        </button>
      )}
    </div>
  );
}
