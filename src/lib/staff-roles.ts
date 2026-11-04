import type { Role } from "@prisma/client";

export const STAFF_ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  RECEPTIONIST: "Front-desk",
  ASSISTANT: "Assistant",
  DENTIST: "Dentist",
};

export function staffRoleLabel(role: string): string {
  return STAFF_ROLE_LABELS[role as Role] ?? "Staff";
}
