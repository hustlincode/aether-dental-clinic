const styles: Record<string, string> = {
  PENDING: "bg-warning-bg text-warning",
  CONFIRMED: "bg-info-bg text-info",
  CHECKED_IN: "bg-accent-soft text-accent",
  COMPLETED: "bg-success-bg text-success",
  CANCELLED: "bg-error-bg text-error",
  NO_SHOW: "bg-neutral-bg text-neutral-c",
};

export function StatusBadge({ status }: { status: string }) {
  const label = status.replace("_", " ");
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status] || "bg-neutral-bg text-neutral-c"}`}>
      {label}
    </span>
  );
}
