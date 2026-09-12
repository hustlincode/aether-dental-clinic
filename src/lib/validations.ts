import { z } from "zod";

// ─── Patient form schema ────────────────────────────────────────────────────
// Mirrors the fields the patient create/edit modal submits, aligned with what
// POST/PATCH /api/patients accept:
//   - email is OPTIONAL and may be "" (the API maps "" -> null on save; we never
//     fabricate an email, so an empty value is always sent as an empty string).
//   - phone is required with a minimum length that matches the API (7 chars).
//   - notes is optional with a reasonable cap.
//   - status only appears in the edit modal, but is kept optional so the create
//     flow can omit it and let the API default to "ACTIVE".
export const patientFormSchema = z.object({
  firstName: z.string().trim().min(2, "First name must be at least 2 characters."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: z
    .string()
    .trim()
    .email("Please provide a valid email address.")
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().min(7, "Phone number must be at least 7 characters."),
  notes: z.string().trim().max(500, "Notes must be 500 characters or fewer.").optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type PatientFormValues = z.infer<typeof patientFormSchema>;