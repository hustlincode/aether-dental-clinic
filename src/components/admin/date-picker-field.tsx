"use client";

import * as React from "react";
import { format, isValid, parse } from "date-fns";
import { CalendarDays, X } from "lucide-react";
import type { Matcher } from "react-day-picker";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const DATE_KEY_FORMAT = "yyyy-MM-dd";

/** Parse a `YYYY-MM-DD` key as a local calendar date (never UTC). */
function parseDateKey(key: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return undefined;
  const date = parse(key, DATE_KEY_FORMAT, new Date());
  return isValid(date) ? date : undefined;
}

function toDateKey(date: Date): string {
  return format(date, DATE_KEY_FORMAT);
}

function formatDateLabel(key: string): string | undefined {
  const date = parseDateKey(key);
  return date ? format(date, "MMM d, yyyy") : undefined;
}

type DatePickerFieldProps = {
  /** Id applied to the input (or trigger button) and its label. */
  id?: string;
  label: string;
  /** `YYYY-MM-DD`, or an empty string when no date is selected. */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
  /**
   * `input` keeps a real date input (keyboard entry, `fill()` in tests) with a
   * calendar button beside it. `button` is the compact toolbar/filter form.
   */
  variant?: "input" | "button";
  placeholder?: string;
  allowClear?: boolean;
  hideLabel?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  labelClassName?: string;
};

export function DatePickerField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  disabled = false,
  required = false,
  variant = "input",
  placeholder = "Select date",
  allowClear = false,
  hideLabel = false,
  error,
  hint,
  className,
  labelClassName,
}: DatePickerFieldProps) {
  const generatedId = React.useId();
  const fieldId = id ?? generatedId;

  const [open, setOpen] = React.useState(false);

  const selected = parseDateKey(value);
  const minDate = min ? parseDateKey(min) : undefined;
  const maxDate = max ? parseDateKey(max) : undefined;

  const disabledMatchers: Matcher[] = [];
  if (minDate) disabledMatchers.push({ before: minDate });
  if (maxDate) disabledMatchers.push({ after: maxDate });

  const describedBy =
    [hint ? `${fieldId}-hint` : null, error ? `${fieldId}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  function commit(next: Date | undefined) {
    onChange(next ? toDateKey(next) : "");
    setOpen(false);
  }

  const calendar = (
    <PopoverContent
      align="start"
      className="w-auto p-0"
      aria-label={`${label} calendar`}
    >
      <Calendar
        mode="single"
        autoFocus
        selected={selected}
        defaultMonth={selected ?? minDate ?? new Date()}
        disabled={disabledMatchers}
        onSelect={commit}
      />
      <div className="flex items-center justify-between gap-2 border-t border-border p-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => commit(new Date())}
        >
          Today
        </Button>
        {allowClear ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!value}
            onClick={() => commit(undefined)}
          >
            <X aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>
    </PopoverContent>
  );

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label
        htmlFor={fieldId}
        className={cn(
          "text-sm font-medium text-text-secondary",
          hideLabel && "sr-only",
          labelClassName,
        )}
      >
        {label}
      </Label>

      {variant === "input" ? (
        <div className="relative">
          <Input
            id={fieldId}
            type="date"
            value={value}
            min={min}
            max={max}
            required={required}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value)}
            className="rounded-control pr-11 [&::-webkit-calendar-picker-indicator]:hidden"
          />
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                aria-label={`Open ${label} calendar`}
                className="absolute top-1/2 right-1 -translate-y-1/2"
              >
                <CalendarDays aria-hidden />
              </Button>
            </PopoverTrigger>
            {calendar}
          </Popover>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                id={fieldId}
                type="button"
                variant="outline"
                size="default"
                disabled={disabled}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
                className={cn(
                  "justify-start gap-2 font-normal",
                  !selected && "text-text-muted",
                )}
              >
                <CalendarDays aria-hidden />
                {formatDateLabel(value) ?? placeholder}
              </Button>
            </PopoverTrigger>
            {calendar}
          </Popover>
          {allowClear && value ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={`Clear ${label}`}
              onClick={() => onChange("")}
            >
              <X aria-hidden />
            </Button>
          ) : null}
        </div>
      )}

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
    </div>
  );
}
