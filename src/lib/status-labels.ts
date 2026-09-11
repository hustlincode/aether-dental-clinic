// Shared label helper for status-transition ACTION BUTTONS.
//
// The database stores appointment statuses as past-tense STATE names
// (CONFIRMED, CANCELLED, CHECKED_IN, COMPLETED, NO_SHOW). When the same value is
// rendered on a button that performs the transition, it must read as a command
// ("Confirm", "Cancel", "Check In", ...) rather than a state ("Confirmed", ...).

const ACTION_LABELS: Record<string, string> = {
  CONFIRMED: "Confirm",
  CANCELLED: "Cancel",
  CHECKED_IN: "Check In",
  COMPLETED: "Complete",
  NO_SHOW: "Mark No Show",
};

/** Imperative label for a status-transition button. Falls back to title case. */
export function statusActionLabel(status: string): string {
  return (
    ACTION_LABELS[status] ??
    status
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase())
  );
}