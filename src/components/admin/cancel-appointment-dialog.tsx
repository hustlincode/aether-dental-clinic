"use client";

import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CancelAppointmentDialogProps {
  open: boolean;
  /** Patient name shown in the confirmation message. */
  patientName: string;
  /** Appointment reference number shown in the confirmation message. */
  referenceNumber: string;
  /** True while the PATCH request is in flight (shows a busy label). */
  loading?: boolean;
  /** Called with the trimmed remarks (empty string when left blank). */
  onConfirm: (remarks: string) => void;
  onCancel: () => void;
}

/**
 * Confirmation dialog for the CANCEL action (appointments list + calendar).
 * Includes an optional remarks field; when provided, the caller appends the
 * remark to the appointment record so every cancellation leaves an audit trail.
 */
export function CancelAppointmentDialog({
  open,
  patientName,
  referenceNumber,
  loading = false,
  onConfirm,
  onCancel,
}: CancelAppointmentDialogProps) {
  const [remarks, setRemarks] = useState("");

  // Reset the remarks field each time the dialog opens (deferred setState so we
  // never set state synchronously inside the effect).
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setRemarks(""), 0);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">Cancel appointment</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            Are you sure you want to cancel {patientName}&apos;s appointment ({referenceNumber})? The patient will be
            notified by email.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cancel-remarks" className="text-sm font-medium text-text">
            Remarks
          </label>
          <textarea
            id="cancel-remarks"
            rows={3}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Optional reason for the cancellation..."
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <p className="text-xs text-text-muted">The remarks are saved to the appointment record.</p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Keep appointment</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onConfirm(remarks.trim())}
            variant="destructive"
            disabled={loading}
          >
            {loading ? "Cancelling..." : "Cancel appointment"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}