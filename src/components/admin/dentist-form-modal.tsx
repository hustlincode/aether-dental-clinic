"use client";

import { useEffect, useMemo, useRef } from "react";
import { ToggleLeft, ToggleRight, X } from "lucide-react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { dentistFormSchema, type DentistFormValues } from "@/lib/validations";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type { DentistFormValues };

export interface DentistFormInitialData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  specialization: string;
  profileImage: string | null;
  status: "ACTIVE" | "INACTIVE";
}

const EMPTY_FORM: DentistFormValues = {
  name: "",
  email: "",
  phone: "",
  specialization: "",
  profileImage: "",
  status: "ACTIVE",
};

function toFormValues(data: DentistFormInitialData): DentistFormValues {
  return {
    name: data.name,
    email: data.email,
    phone: data.phone || "",
    specialization: data.specialization,
    profileImage: data.profileImage || "",
    status: data.status,
  };
}

// Server-side 422 details come back as { field: string[] }. Apply them to the
// matching form fields so they render inline like client-side errors.
const FIELD_NAMES: ReadonlyArray<keyof DentistFormValues> = [
  "name",
  "email",
  "phone",
  "specialization",
  "profileImage",
  "status",
];

function applyServerErrors(form: UseFormReturn<DentistFormValues>, details: unknown) {
  if (!details || typeof details !== "object") return;
  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
      if (FIELD_NAMES.includes(key as keyof DentistFormValues)) {
        form.setError(key as keyof DentistFormValues, { message: value[0] });
      }
    }
  }
}

// â”€â”€â”€ Shared field styling (keeps the previous visual design) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const inputClass = "bg-surface-alt shadow-none aria-invalid:border-error";

const labelClass = "block text-text-secondary data-[error=true]:text-text-secondary";

// â”€â”€â”€ Dentist Form Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function DentistFormModal({
  open,
  onClose,
  onSave,
  initialData,
  title,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: DentistFormValues) => Promise<void>;
  initialData?: DentistFormInitialData | null;
  title: string;
}) {
  const defaultValues = useMemo(
    () => (initialData ? toFormValues(initialData) : { ...EMPTY_FORM }),
    [initialData],
  );

  const form = useForm<DentistFormValues>({
    resolver: zodResolver(dentistFormSchema),
    defaultValues,
  });
  const { isSubmitting } = form.formState;
  const nameRef = useRef<HTMLInputElement>(null);

  // Reset the form whenever the modal opens or the target dentist changes. The
  // parent also remounts via `key`, so this is a safety net.
  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
    }
  }, [open, defaultValues, form]);

  // Focus the name input when the modal opens (no state changes, just a focus).
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => nameRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open]);

  async function handleSubmit(values: DentistFormValues) {
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
            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="gap-1">
                  <FormLabel className={labelClass}>
                    Full Name <span className="text-error">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Dr. Maria Santos"
                      {...field}
                      ref={(el) => {
                        field.ref(el);
                        nameRef.current = el;
                      }}
                      className={inputClass}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            {/* Email */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="gap-1">
                  <FormLabel className={labelClass}>
                    Email <span className="text-error">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="maria@aetherdental.ph"
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
                  <FormLabel className={labelClass}>Phone Number</FormLabel>
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

            {/* Specialization */}
            <FormField
              control={form.control}
              name="specialization"
              render={({ field }) => (
                <FormItem className="gap-1">
                  <FormLabel className={labelClass}>
                    Specialization <span className="text-error">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="General Dentistry"
                      {...field}
                      className={inputClass}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            {/* Profile image URL */}
            <FormField
              control={form.control}
              name="profileImage"
              render={({ field }) => (
                <FormItem className="gap-1">
                  <FormLabel className={labelClass}>Profile Image URL</FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      placeholder="https://example.com/maria.jpg"
                      {...field}
                      className={inputClass}
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
                {isSubmitting ? "Saving..." : initialData ? "Update Dentist" : "Add Dentist"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
