import { AlertTriangle, RefreshCw, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

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
      <span className="flex h-12 w-12 items-center justify-center rounded-pill bg-error-bg text-error">
        <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden />
      </span>
      <h3 className="mt-3 text-sm font-semibold text-text">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-text-secondary">{message}</p>}
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onRetry}
          className="mt-4"
        >
          <RefreshCw size={14} aria-hidden />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
