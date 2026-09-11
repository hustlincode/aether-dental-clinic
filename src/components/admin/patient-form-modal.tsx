"use client";

import { useEffect, useMemo, useRef } from "react";
import { ToggleLeft, ToggleRight, X } from "lucide-react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { patientFormSchema, type PatientFormValues } from "@/lib/validations";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ───────────────────────────────────────────────────────────────────

export type { PatientFormValues };

export interface PatientFormInitialData {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE";
  followUpEnabled: boolean;
  followUpDays: number;
}

const EMPTY_FORM: PatientFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  notes: "",
  status: "ACTIVE",
  followUpEnabled: true,
  followUpDays: 1,
};

function toFormValues(data: PatientFormInitialData): PatientFormValues {
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email || "",
    phone: data.phone,
    notes: data.notes || "",
    status: data.status,
    followUpEnabled: data.followUpEnabled,
    followUpDays: data.followUpDays,
  };
}

// Server-side 422 details come back as { field: string[] }. Apply them to the
// matching form fields so they render inline like client-side errors.
const FIELD_NAMES: ReadonlyArray<keyof PatientFormValues> = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "notes",
  "status",
  "followUpEnabled",
  "followUpDays",
];

function applyServerErrors(form: UseFormReturn<PatientFormValues>, details: unknown) {
  if (!details || typeof details !== "object") return;
  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
      if (FIELD_NAMES.includes(key as keyof PatientFormValues)) {
        form.setError(key as keyof PatientFormValues, { message: value[0] });
      }
    }
  }
}

// ─── Shared field styling (keeps the previous visual design) ─────────────────

const inputClass =
  "h-auto w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder:text-text-muted shadow-none transition focus:border-accent focus:outline-none focus-visible:border-accent focus-visible:ring-0 aria-invalid:border-border aria-invalid:ring-0 dark:bg-surface-alt";

const textareaClass =
  "field-sizing-fixed min-h-0 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder:text-text-muted shadow-none transition focus:border-accent focus:outline-none focus-visible:border-accent focus-visible:ring-0 aria-invalid:border-border aria-invalid:ring-0 resize-none dark:bg-surface-alt";

const labelClass = "block text-text-secondary data-[error=true]:text-text-secondary";

// ─── Patient Form Modal ──────────────────────────────────────────────────────

export function PatientFormModal({
  open,
  onClose,
  onSave,
  initialData,
  title,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: PatientFormValues) => Promise<void>;
  initialData?: PatientFormInitialData | null;
  title: string;
}) {
  const defaultValues = useMemo(
    () => (initialData ? toFormValues(initialData) : { ...EMPTY_FORM }),
    [initialData],
  );

  const form = useForm<PatientFormValues>({
    resolver: zodResolver(patientFormSchema),
    defaultValues,
  });
  const { isSubmitting } = form.formState;
  const firstNameRef = useRef<HTMLInputElement>(null);

  // Reset the form whenever the modal opens or the target patient changes. The
  // parent also remounts via `key`, so this is a safety net.
  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
    }
  }, [open, defaultValues, form]);

  // Focus the first name input when the modal opens (no state changes, just a focus).
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => firstNameRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open]);

  async function handleSubmit(values: PatientFormValues) {
    try {
      await onSave(values);
    } catch (err) {
      // Map server-side 422 details (if any) to per-field errors. The parent
      // already toasts the failure, so we intentionally do NOT rethrow — this
      // prevents an unhandled promise rejection in the browser console.
      if (err && typeof err === "object" && "details" in err) {
        const details = (err as { details?: unknown }).details;
        if (details) applyServerErrors(form, details);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showCloseButton={false} className="w-full max-w-md gap-4 rounded-2xl border border-border-strong bg-surface p-6 shadow-lg sm:max-w-md">
        <div className="flex items-center justify-between mb-5">
          <DialogTitle className="text-lg font-bold text-text">{title}</DialogTitle>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface-alt hover:text-text">
            <X size={18} />
          </button>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} noValidate className="space-y-4">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem className="gap-1">
                    <FormLabel className={labelClass}>
                      First Name <span className="text-error">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="John"
                        {...field}
                        ref={(el) => {
                          field.ref(el);
                          firstNameRef.current = el;
                        }}
                        className={inputClass}
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem className="gap-1">
                    <FormLabel className={labelClass}>
                      Last Name <span className="text-error">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Doe" {...field} className={inputClass} />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>

            {/* Email */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="gap-1">
                  <FormLabel className={labelClass}>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="john.doe@example.com"
                      {...field}
                      className={inputClass}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            {/* Phone */}
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem className="gap-1">
                  <FormLabel className={labelClass}>
                    Phone Number <span className="text-error">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="0917 123 4567"
                      {...field}
                      className={inputClass}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="gap-1">
                  <FormLabel className={labelClass}>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Allergies, preferences, or other notes (optional)"
                      {...field}
                      className={textareaClass}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            {/* Status (edit only) */}
            {initialData && (
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="gap-1">
                    <FormLabel className={labelClass}>Status</FormLabel>
                    <FormControl>
                      <button
                        type="button"
                        onClick={() => field.onChange(field.value === "ACTIVE" ? "INACTIVE" : "ACTIVE")}
                        className="flex items-center gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm font-medium transition hover:border-border-accent"
                      >
                        {field.value === "ACTIVE" ? (
                          <ToggleRight size={20} className="text-success" />
                        ) : (
                          <ToggleLeft size={20} className="text-text-muted" />
                        )}
                        <span className={field.value === "ACTIVE" ? "text-success" : "text-text-muted"}>
                          {field.value === "ACTIVE" ? "Active" : "Inactive"}
                        </span>
                      </button>
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            )}

            {/* Follow-up emails */}
            <FormField
              control={form.control}
              name="followUpEnabled"
              render={({ field }) => (
                <div className="rounded-lg border border-border bg-surface-alt p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text">Follow-up emails</p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        Send an automated follow-up after each completed appointment.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => field.onChange(!field.value)}
                      aria-pressed={field.value}
                      className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                        field.value
                          ? "border-border-accent bg-accent-soft text-accent"
                          : "border-border text-text-muted"
                      }`}
                    >
                      {field.value ? (
                        <ToggleRight size={18} className="text-accent" />
                      ) : (
                        <ToggleLeft size={18} />
                      )}
                      {field.value ? "Enabled" : "Disabled"}
                    </button>
                  </div>

                  {field.value && (
                    <FormField
                      control={form.control}
                      name="followUpDays"
                      render={({ field: daysField }) => (
                        <div className="mt-3 flex items-center gap-3">
                          <label htmlFor="patient-follow-up-days" className="text-sm text-text-secondary">
                            Send after
                          </label>
                          <Input
                            id="patient-follow-up-days"
                            type="number"
                            min={0}
                            max={60}
                            {...daysField}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              daysField.onChange(Number.isNaN(v) ? 0 : Math.max(0, Math.min(60, v)));
                            }}
                            className="h-auto w-20 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text shadow-none focus:border-accent focus:outline-none focus-visible:border-accent focus-visible:ring-0"
                          />
                          <span className="text-sm text-text-muted">
                            {daysField.value === 1 ? "day" : "days"} after the visit
                          </span>
                        </div>
                      )}
                    />
                  )}
                </div>
              )}
            />

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-surface-alt"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="gradient-gold rounded-lg px-5 py-2 text-sm font-bold text-[#0E0F10] transition hover:opacity-90 disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : initialData ? "Update Patient" : "Add Patient"}
              </button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}