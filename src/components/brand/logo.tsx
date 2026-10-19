import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";

type LogoVariant = "inline" | "stacked";

export interface LogoProps {
  /** Set to `null` when the logo is not a navigation target (for example, a login screen). */
  href?: string | null;
  variant?: LogoVariant;
  showTagline?: boolean;
  priority?: boolean;
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  taglineClassName?: string;
}

/**
 * The shared Aether Dental lockup: tooth monogram + live text wordmark.
 *
 * The wordmark stays as HTML rather than being baked into the SVG so it picks up
 * the surrounding typeface, colour tokens and theme. The mark is the same asset
 * as `/logo.svg`, so there is one logo to maintain.
 */
export function Logo({
  href = "/",
  variant = "inline",
  showTagline = false,
  priority = false,
  className,
  markClassName,
  wordmarkClassName,
  taglineClassName,
}: LogoProps) {
  const content = (
    <span
      className={cn(
        "inline-flex",
        variant === "inline" ? "items-center gap-2.5" : "flex-col items-center gap-2 text-center",
        className
      )}
    >
      <Image
        src="/logo.svg"
        alt=""
        width={64}
        height={64}
        priority={priority}
        className={cn("h-9 w-9 shrink-0", markClassName)}
      />
      <span className={cn("flex flex-col leading-tight", variant === "stacked" && "items-center")}>
        <span className={cn("text-lg font-semibold", wordmarkClassName)}>
          <span>Aether </span>
          <span className="text-accent">Dental</span>
        </span>
        {showTagline && (
          <span className={cn("mt-0.5 text-xs text-text-muted", taglineClassName)}>
            Clinic Management
          </span>
        )}
      </span>
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} aria-label="Aether Dental home" className="inline-flex shrink-0 rounded-control">
      {content}
    </Link>
  );
}
