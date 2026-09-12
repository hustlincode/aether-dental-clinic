import type { ReactNode } from "react";
import { cn } from "cn";

export interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  padded?: boolean;
}

/**
 * Canonical content surface with an optional header/footer.
 * Use this instead of repeating card className strings across modules.
 */
export function SectionCard({
  title,
  description,
  actions,
  footer,
  children,
  className,
  headerClassName,
  bodyClassName,
  padded = true,
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <section className={cn("card-surface overflow-hidden", className)}>
      {hasHeader && (
        <header
          className={cn(
            "flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between",
            headerClassName,
          )}
        >
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold text-text">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-text-muted">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          )}
        </header>
      )}
      <div className={cn(padded && "p-5", bodyClassName)}>{children}</div>
      {footer && (
        <footer className="border-t border-border px-5 py-3">{footer}</footer>
      )}
    </section>
  );
}
