import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/** Consistent vertical rhythm and max width for admin pages. */
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn("mx-auto w-full max-w-[1600px] space-y-5", className)}>
      {children}
    </div>
  );
}
