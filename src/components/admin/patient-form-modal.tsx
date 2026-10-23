"use client";

import { useEffect, useMemo, useRef } from "react";
import { ToggleLeft, ToggleRight, X } from "lucide-react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { patientFormSchema, type PatientFormValues } from "@/lib/validations";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type { PatientFormValues };

export interface PatientFormInitialData {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE";
}

const EMPTY_FORM: PatientFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  notes: "",
  status: "ACTIVE",
};

function toFormValues(data: PatientFormInitialData): PatientFormValues {
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email || "",
    phone: data.phone,
    notes: data.notes || "",
    status: data.status,
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

// â”€â”€â”€ Shared field styling (keeps the previous visual design) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const inputClass = "bg-surface-alt shadow-none aria-invalid:border-error";

const textareaClass =
  "field-sizing-fixed min-h-20 resize-none bg-surface-alt shadow-none aria-invalid:border-error";

const labelClass = "block text-text-secondary data-[error=true]:text-text-secondary";

// â”€â”€â”€ Patient Form Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      // already toasts the failure, so we intentionally do NOT rethrow â€” this
      // prevents an unhandled promise rejection in the browser console.
      if (err && typeof err === "object" && "details" in err) {
        const details = (err as { details?: unknown }).details;
        if (details) applyServerErrors(form, details);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showCloseButton={false} className="w-[calc(100%-2rem)] max-w-md gap-4 sm:max-w-md">
        <div className="mb-2 flex items-center justify-between">
          <DialogTitle className="text-title-sm text-text">{title}</DialogTitle>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </Button>
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
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={() => field.onChange(field.value === "ACTIVE" ? "INACTIVE" : "ACTIVE")}
                        aria-pressed={field.value === "ACTIVE"}
                      >
                        {field.value === "ACTIVE" ? (
                          <ToggleRight size={20} className="text-success" />
                        ) : (
                          <ToggleLeft size={20} className="text-text-muted" />
                        )}
                        <span className={field.value === "ACTIVE" ? "text-success" : "text-text-muted"}>
                          {field.value === "ACTIVE" ? "Active" : "Inactive"}
                        </span>
                      </Button>
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="ghost" size="default" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" size="default" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : initialData ? "Update Patient" : "Add Patient"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
