"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Field, FieldLabel } from "@/components/ui/field";
import { TimePicker, TimePickerClear, TimePickerColumns, TimePickerConfirm, TimePickerContent, TimePickerFooter, TimePickerNow, TimePickerTrigger } from "@/components/reui/time-picker";

type TimeFieldProps = {
  /** Id applied to the picker trigger and its label. */
  id?: string;
  label: string;
  /** `HH:mm` (24-hour), matching the clinic API's time format. */
  value: string;
  onChange: (value: string) => void;
  /** Override the accessible name when the visible label is only a column head. */
  ariaLabel?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  labelClassName?: string;
};

/** Shared REUI picker; the existing forms keep their HH:mm/empty-string values. */
export function TimeField({
  id,
  label,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  required = false,
  error,
  hint,
  className,
  labelClassName,
}: TimeFieldProps) {
  const generatedId = React.useId();
  const fieldId = id ?? generatedId;

  const describedBy =
    [hint ? `${fieldId}-hint` : null, error ? `${fieldId}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <Field data-disabled={disabled || undefined} data-invalid={error ? true : undefined} className={cn("gap-1.5", className)}>
      <FieldLabel
        id={`${fieldId}-label`}
        htmlFor={fieldId}
        className={cn(
          "text-sm font-medium text-text-secondary",
          labelClassName,
        )}
      >
        {label}
      </FieldLabel>
      <TimePicker
        id={fieldId}
        value={value || null}
        onValueChange={(next) => onChange(next ?? "")}
        hourCycle={24}
        granularity="minute"
        minuteStep={1}
        disabled={disabled}
        required={required}
        invalid={Boolean(error)}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : `${fieldId}-label`}
        aria-describedby={describedBy}
      >
        <TimePickerTrigger className="w-full" />
        <TimePickerContent>
          <TimePickerColumns />
          <TimePickerFooter>
            <TimePickerNow />
            {!required && <TimePickerClear />}
            <TimePickerConfirm />
          </TimePickerFooter>
        </TimePickerContent>
      </TimePicker>
      {hint ? (
        <p id={`${fieldId}-hint`} className="text-sm text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${fieldId}-error`} className="text-sm text-error">
          {error}
        </p>
      ) : null}
    </Field>
  );
}
