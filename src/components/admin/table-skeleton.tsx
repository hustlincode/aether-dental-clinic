import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

/** Uniform table loading placeholder used by list modules. */
export function TableSkeleton({
  rows = 5,
  columns = 4,
  className,
}: TableSkeletonProps) {
  return (
    <div
      className={cn("divide-y divide-border", className)}
      aria-hidden
      role="presentation"
    >
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn(
                "h-4",
                colIndex === 0 ? "w-1/3" : colIndex === columns - 1 ? "ml-auto w-16" : "w-1/6",
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
