"use client";

import { useEffect, useRef, useState } from "react";
import { ToggleLeft, ToggleRight, X } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PatientFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface PatientFormInitialData {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE";
}

type FormErrors = Record<string, string>;

const EMPTY_FORM: PatientFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  notes: "",
  status: "ACTIVE",
};

function mapDetailsToErrors(details: unknown): FormErrors {
  const out: FormErrors = {};
  if (!details || typeof details !== "object") return out;
  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
      out[key] = value[0];
    }
  }
  return out;
}

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
  // Form state is initialized lazily from `initialData`. The parent remounts
  // this component (via `key`) whenever it is opened, so the form always
  // reflects the target patient without needing a sync effect.
  const [form, setForm] = useState<PatientFormValues>(() =>
    initialData
      ? {
          firstName: initialData.firstName,
          lastName: initialData.lastName,
          email: initialData.email || "",
          phone: initialData.phone,
          notes: initialData.notes || "",
          status: initialData.status,
        }
      : { ...EMPTY_FORM },
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const firstNameRef = useRef<HTMLInputElement>(null);

  // Focus the first name input when the modal opens (no state changes, just a focus).
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => firstNameRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Close on Escape (same convention as the details drawer).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  function validate(): boolean {
    const errs: FormErrors = {};
    if (!form.firstName.trim()) errs.firstName = "First name is required.";
    if (!form.lastName.trim()) errs.lastName = "Last name is required.";
    if (form.phone.trim().length < 7) errs.phone = "Phone number must be at least 7 characters.";
    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "Please provide a valid email address.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        notes: form.notes.trim(),
        status: form.status,
      });
    } catch (err) {
      // Map server-side 422 details (if any) to per-field errors. The parent
      // already toasts the failure, so we intentionally do NOT rethrow — this
      // prevents an unhandled promise rejection in the browser console.
      if (err && typeof err === "object" && "details" in err) {
        const details = (err as { details?: unknown }).details;
        if (details) setErrors(mapDetailsToErrors(details));
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border-strong bg-surface p-6 shadow-lg animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-form-title"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="patient-form-title" className="text-lg font-bold text-text">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface-alt hover:text-text" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                First Name <span className="text-error">*</span>
              </label>
              <input
                ref={firstNameRef}
                type="text"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder-text-muted transition focus:border-accent focus:outline-none"
                placeholder="John"
              />
              {errors.firstName && <p className="mt-1 text-xs text-error">{errors.firstName}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Last Name <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder-text-muted transition focus:border-accent focus:outline-none"
                placeholder="Doe"
              />
              {errors.lastName && <p className="mt-1 text-xs text-error">{errors.lastName}</p>}
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder-text-muted transition focus:border-accent focus:outline-none"
              placeholder="john.doe@example.com"
            />
            {errors.email && <p className="mt-1 text-xs text-error">{errors.email}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Phone Number <span className="text-error">*</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder-text-muted transition focus:border-accent focus:outline-none"
              placeholder="0917 123 4567"
            />
            {errors.phone && <p className="mt-1 text-xs text-error">{errors.phone}</p>}
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder-text-muted transition focus:border-accent focus:outline-none resize-none"
              placeholder="Allergies, preferences, or other notes (optional)"
            />
          </div>

          {/* Status (edit only) */}
          {initialData && (
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Status</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, status: f.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }))}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm font-medium transition hover:border-border-accent"
                >
                  {form.status === "ACTIVE" ? (
                    <ToggleRight size={20} className="text-success" />
                  ) : (
                    <ToggleLeft size={20} className="text-text-muted" />
                  )}
                  <span className={form.status === "ACTIVE" ? "text-success" : "text-text-muted"}>
                    {form.status === "ACTIVE" ? "Active" : "Inactive"}
                  </span>
                </button>
              </div>
            </div>
          )}

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
              disabled={saving}
              className="gradient-gold rounded-lg px-5 py-2 text-sm font-bold text-[#0E0F10] transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving..." : initialData ? "Update Patient" : "Add Patient"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}