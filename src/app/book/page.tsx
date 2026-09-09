"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { ThemeToggle } from "@/components/ui/theme-toggle";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Service {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: { toString(): string } | string | number;
  status: string;
}

interface Dentist {
  id: string;
  name: string;
  specialization: string;
  profileImage: string | null;
  status: string;
}

interface Slot {
  start: string;
  end: string;
}

interface BookingResult {
  referenceNumber: string;
  patientName: string;
  patientEmail?: string;
  serviceName: string;
  dentistName: string;
  date: string;
  time: string;
  status: string;
}

type Step = "service" | "dentist" | "date" | "time" | "info" | "review" | "success";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const peso = (v: string | number | { toString(): string }) => {
  const n = typeof v === "object" && v !== null ? Number(v.toString()) : Number(v);
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 0 });
};

const formatTime = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const p = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${p}`;
};

const formatLongDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
};

// ---------------------------------------------------------------------------
// Main booking wizard
// ---------------------------------------------------------------------------

export default function BookPage() {
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("service");
  const [loadingInitial, setLoadingInitial] = useState(true);

  // selections
  const [services, setServices] = useState<Service[]>([]);
  const [dentists, setDentists] = useState<Dentist[]>([]);
  const [service, setService] = useState<Service | null>(null);
  const [dentist, setDentist] = useState<Dentist | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [time, setTime] = useState<Slot | null>(null);

  // available dates for calendar
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // patient info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);

  // current month for calendar
  const [calCursor, setCalCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  useEffect(() => {
    (async () => {
      try {
        const [svcRes, dentRes] = await Promise.all([
          fetch("/api/services").then((r) => r.json()),
          fetch("/api/dentists").then((r) => r.json()),
        ]);
        setServices(svcRes.data || []);
        setDentists(dentRes.data || []);
      } catch {
        toast("Unable to load booking options. Please try again.", "error");
      } finally {
        setLoadingInitial(false);
      }
    })();
  }, [toast]);

  const selectedDentist = useMemo(
    () => (dentist ? dentists.find((d) => d.id === dentist.id) || dentist : null),
    [dentist, dentists]
  );

  // Fetch available dates when dentist + service are chosen
  useEffect(() => {
    if (!dentist || !service) return;
    let cancelled = false;
    fetch(`/api/availability/dates?dentistId=${dentist.id}&serviceId=${service.id}&daysAhead=45`)
      .then(async (r) => {
        setLoadingDates(true);
        setAvailableDates([]);
        setDate(null);
        setSlots([]);
        setTime(null);
        const res = await r.json();
        if (!cancelled) setAvailableDates(res.data || []);
      })
      .catch(() => {
        if (!cancelled) toast("Unable to load available dates.", "error");
      })
      .finally(() => {
        if (!cancelled) setLoadingDates(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dentist, service, toast]);

  // Fetch slots when date changes
  useEffect(() => {
    if (!dentist || !service || !date) return;
    let cancelled = false;
    fetch(`/api/availability/slots?dentistId=${dentist.id}&serviceId=${service.id}&date=${date}`)
      .then(async (r) => {
        setLoadingSlots(true);
        setSlots([]);
        setTime(null);
        const res = await r.json();
        if (!cancelled) setSlots(res.data || []);
      })
      .catch(() => {
        if (!cancelled) toast("Unable to load time slots.", "error");
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dentist, service, date, toast]);

  // Calendar helpers
  const calDays = useMemo(() => {
    const first = new Date(calCursor.y, calCursor.m, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(calCursor.y, calCursor.m + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [calCursor]);

  const monthLabel = useMemo(
    () => new Date(calCursor.y, calCursor.m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    [calCursor]
  );

  const dateIsAvailable = (d: number) => {
    const iso = `${calCursor.y}-${String(calCursor.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return availableDates.includes(iso);
  };

  const selectDate = (d: number) => {
    const iso = `${calCursor.y}-${String(calCursor.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (availableDates.includes(iso)) {
      setDate(iso);
      setStep("time");
    }
  };

  const shiftMonth = (delta: number) => {
    setCalCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const validateInfo = () => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = "First name is required.";
    if (!lastName.trim()) e.lastName = "Last name is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Please provide a valid email.";
    if (phone.replace(/\D/g, "").length < 7) e.phone = "Please provide a valid phone number.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const goReview = () => {
    if (validateInfo()) setStep("review");
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: service!.id,
          dentistId: dentist!.id,
          date,
          startTime: time!.start,
          firstName,
          lastName,
          email,
          phone,
          notes: notes || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast(body.message || "Unable to book the appointment.", "error");
        return;
      }
      setResult(body.data.subject);
      setStep("success");
    } catch {
      toast("Unable to book the appointment. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep("service");
    setService(null);
    setDentist(null);
    setDate(null);
    setSlots([]);
    setTime(null);
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setNotes("");
    setResult(null);
  };

  // ------------------------- RENDER -------------------------
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-surface border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="gradient-gold-text text-xl font-bold">
            Aether Dental
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-text-secondary hover:text-accent transition-colors duration-200">
              Staff login
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold text-text">Book an Appointment</h1>
        <p className="mt-1 text-sm text-text-muted">
          {step === "success" ? "Your appointment is confirmed." : "Complete the steps below to schedule your visit."}
        </p>

        {step !== "success" && <StepIndicator step={step} />}

        <div className="mt-6">
          {loadingInitial ? (
            <LoadingBlock />
          ) : step === "service" ? (
            <SelectService services={services} onSelect={(s) => { setService(s); setStep("dentist"); }} />
          ) : step === "dentist" ? (
            <SelectDentist dentists={dentists} service={service} onSelect={(d) => { setDentist(d); setStep("date"); }} onBack={() => setStep("service")} />
          ) : step === "date" ? (
            <SelectDate
              monthLabel={monthLabel}
              calDays={calDays}
              dateIsAvailable={dateIsAvailable}
              selectDate={selectDate}
              shiftMonth={shiftMonth}
              loading={loadingDates}
              onBack={() => setStep("dentist")}
            />
          ) : step === "time" ? (
            <SelectTime slots={slots} loading={loadingSlots} selected={time?.start} onSelect={(s) => { setTime(s); setStep("info"); }} onBack={() => { setStep("date"); }} />
          ) : step === "info" ? (
            <PatientInfo
              values={{ firstName, lastName, email, phone, notes }}
              errors={errors}
              onChange={setField}
              onContinue={goReview}
              onBack={() => setStep("time")}
            />
          ) : step === "review" ? (
            <Review
              service={service!}
              dentist={selectedDentist!}
              date={date!}
              time={time!}
              submit={submit}
              submitting={submitting}
              onBack={() => setStep("info")}
            />
          ) : step === "success" && result ? (
            <SuccessScreen result={result} onReset={reset} />
          ) : null}
        </div>
      </main>
    </div>
  );

  function setField(field: string, value: string) {
    switch (field) {
      case "firstName": setFirstName(value); break;
      case "lastName": setLastName(value); break;
      case "email": setEmail(value); break;
      case "phone": setPhone(value); break;
      case "notes": setNotes(value); break;
    }
  }
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({ step }: { step: Step }) {
  const labels: { key: Step; label: string }[] = [
    { key: "service", label: "Service" },
    { key: "dentist", label: "Dentist" },
    { key: "date", label: "Date" },
    { key: "time", label: "Time" },
    { key: "info", label: "Details" },
    { key: "review", label: "Review" },
  ];
  const order = ["service", "dentist", "date", "time", "info", "review"];
  const current = order.indexOf(step);

  return (
    <div className="mt-6 flex items-center gap-1 overflow-x-auto">
      {labels.map((l, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={l.key} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all duration-300 ${
                active
                  ? "bg-accent text-[#0E0F10]"
                  : done
                    ? "bg-accent-soft text-accent"
                    : "bg-surface text-text-muted border border-border"
              }`}
            >
              <span>{done ? "✓" : i + 1}</span>
              {l.label}
            </div>
            {i < labels.length - 1 && <div className="h-px w-4 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

function LoadingBlock() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      <p className="mt-4 text-sm text-text-muted">Loading booking options...</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Service
// ---------------------------------------------------------------------------

function SelectService({ services, onSelect }: { services: Service[]; onSelect: (s: Service) => void }) {
  if (services.length === 0) {
    return <EmptyState title="No services available" message="Please check back later." icon="🦷" />;
  }
  return (
    <div className="space-y-3 animate-slide-up">
      <p className="text-sm font-medium text-text-secondary">Choose a service</p>
      {services.map((s, i) => (
        <button
          key={s.id}
          onClick={() => onSelect(s)}
          style={{ animationDelay: `${i * 60}ms` }}
          className="animate-slide-up flex w-full items-center justify-between rounded-xl border border-border bg-surface p-4 text-left shadow transition-all duration-200 hover:border-border-accent hover:shadow-lg"
        >
          <div>
            <div className="font-semibold text-text">{s.name}</div>
            {s.description && <div className="mt-0.5 text-sm text-text-secondary">{s.description}</div>}
            <div className="mt-1 text-xs text-text-muted">Duration: {s.durationMin} min</div>
          </div>
          <div className="ml-4 text-right">
            <div className="font-bold text-accent">{peso(s.price)}</div>
            <div className="mt-1 text-xs font-medium text-text-muted">Select →</div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Dentist
// ---------------------------------------------------------------------------

function SelectDentist({ dentists, service, onSelect, onBack }: { dentists: Dentist[]; service: Service | null; onSelect: (d: Dentist) => void; onBack: () => void }) {
  return (
    <div className="animate-slide-up">
      <BackLink onClick={onBack} label="Change service" />
      <p className="mb-3 mt-4 text-sm font-medium text-text-secondary">
        Choose a dentist{service ? ` for ${service.name}` : ""}
      </p>
      {dentists.length === 0 ? (
        <EmptyState title="No dentists available" message="Please check back later." icon="🩺" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {dentists.map((d) => (
            <button
              key={d.id}
              onClick={() => onSelect(d)}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left shadow transition-all duration-200 hover:border-border-accent hover:shadow-lg"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-lg font-bold text-accent">
                {d.name.replace(/^Dr\.?\s*/, "").charAt(0)}
              </div>
              <div>
                <div className="font-semibold text-text">{d.name}</div>
                <div className="text-sm text-text-secondary">{d.specialization}</div>
                <div className="mt-0.5 text-xs font-medium text-success">Available</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Date
// ---------------------------------------------------------------------------

function SelectDate({
  monthLabel, calDays, dateIsAvailable, selectDate, shiftMonth, loading, onBack,
}: {
  monthLabel: string;
  calDays: (number | null)[];
  dateIsAvailable: (d: number) => boolean;
  selectDate: (d: number) => void;
  shiftMonth: (d: number) => void;
  loading: boolean;
  onBack: () => void;
}) {
  return (
    <div className="animate-slide-up">
      <BackLink onClick={onBack} label="Change dentist" />
      <div className="mt-4 rounded-xl border border-border bg-surface p-4 shadow">
        <div className="flex items-center justify-between">
          <button onClick={() => shiftMonth(-1)} className="rounded-lg px-3 py-1 text-text-secondary hover:text-accent transition-colors duration-200">←</button>
          <div className="font-semibold text-text">{monthLabel}</div>
          <button onClick={() => shiftMonth(1)} className="rounded-lg px-3 py-1 text-text-secondary hover:text-accent transition-colors duration-200">→</button>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-text-muted">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <div key={d} className="py-1">{d}</div>)}
        </div>
        {loading ? (
          <div className="py-10 text-center text-sm text-text-muted">Loading available dates...</div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {calDays.map((d, i) => {
              if (d === null) return <div key={`b${i}`} />;
              const avail = dateIsAvailable(d);
              return (
                <button
                  key={d}
                  disabled={!avail}
                  onClick={() => selectDate(d)}
                  className={`aspect-square rounded-lg text-sm font-medium transition-all duration-200 ${
                    avail
                      ? "bg-accent text-[#0E0F10] hover:bg-accent-hover"
                      : "text-text-muted"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-center text-xs text-text-muted">Only dates with available slots are shown.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Time
// ---------------------------------------------------------------------------

function SelectTime({ slots, loading, selected, onSelect, onBack }: { slots: Slot[]; loading: boolean; selected?: string; onSelect: (s: Slot) => void; onBack: () => void }) {
  return (
    <div className="animate-slide-up">
      <BackLink onClick={onBack} label="Change date" />
      <p className="mb-3 mt-4 text-sm font-medium text-text-secondary">Choose a time</p>
      {loading ? (
        <div className="py-10 text-center text-sm text-text-muted">Loading available times...</div>
      ) : slots.length === 0 ? (
        <EmptyState title="No slots available" message="This day has no remaining openings. Please pick another date." icon="⏰" />
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {slots.map((s) => (
            <button
              key={s.start}
              onClick={() => onSelect(s)}
              className={`rounded-lg border py-2.5 text-sm font-medium transition-all duration-200 ${
                selected === s.start
                  ? "border-accent bg-accent text-[#0E0F10]"
                  : "border-border bg-surface text-text-secondary hover:border-border-accent hover:text-accent"
              }`}
            >
              {formatTime(s.start)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5: Patient info
// ---------------------------------------------------------------------------

function PatientInfo({
  values, errors, onChange, onContinue, onBack,
}: {
  values: { firstName: string; lastName: string; email: string; phone: string; notes: string };
  errors: Record<string, string>;
  onChange: (f: string, v: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div className="animate-slide-up">
      <BackLink onClick={onBack} label="Change time" />
      <p className="mb-3 mt-4 text-sm font-medium text-text-secondary">Your information</p>
      <div className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" value={values.firstName} onChange={(v) => onChange("firstName", v)} error={errors.firstName} placeholder="John" />
          <Field label="Last name" value={values.lastName} onChange={(v) => onChange("lastName", v)} error={errors.lastName} placeholder="Doe" />
        </div>
        <Field label="Email" type="email" value={values.email} onChange={(v) => onChange("email", v)} error={errors.email} placeholder="you@example.com" />
        <Field label="Phone number" value={values.phone} onChange={(v) => onChange("phone", v)} error={errors.phone} placeholder="0917 123 4567" />
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Notes (optional)</label>
          <textarea
            value={values.notes}
            onChange={(e) => onChange("notes", e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder-text-muted transition-colors duration-200 focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Any concerns or preferences..."
          />
        </div>
        <button
          onClick={onContinue}
          className="gradient-gold w-full rounded-lg py-3 font-semibold text-[#0E0F10] shadow transition-all duration-200 hover:opacity-90"
        >
          Continue to review
        </button>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, error, placeholder, type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-text-secondary">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border bg-surface-alt px-3 py-2 text-sm text-text placeholder-text-muted transition-colors duration-200 focus:outline-none focus:ring-2 ${
          error
            ? "border-error focus:border-error focus:ring-error"
            : "border-border focus:border-accent focus:ring-ring"
        }`}
      />
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 6: Review
// ---------------------------------------------------------------------------

function Review({
  service, dentist, date, time, submit, submitting, onBack,
}: {
  service: Service;
  dentist: Dentist;
  date: string;
  time: Slot;
  submit: () => void;
  submitting: boolean;
  onBack: () => void;
}) {
  return (
    <div className="animate-slide-up">
      <BackLink onClick={onBack} label="Edit details" />
      <p className="mb-3 mt-4 text-sm font-medium text-text-secondary">Review your appointment</p>
      <div className="rounded-xl border border-border bg-surface p-5 shadow">
        <dl className="divide-y divide-border">
          <Row label="Service" value={service.name} />
          <Row label="Dentist" value={dentist.name} />
          <Row label="Date" value={formatLongDate(date)} />
          <Row label="Time" value={formatTime(time.start)} />
          <Row label="Duration" value={`${service.durationMin} minutes`} />
          <Row label="Price" value={peso(service.price)} />
        </dl>
        <button
          onClick={submit}
          disabled={submitting}
          className="gradient-gold mt-5 w-full rounded-lg py-3 font-semibold text-[#0E0F10] shadow transition-all duration-200 hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Booking..." : "Confirm booking"}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="text-sm font-semibold text-text">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

function SuccessScreen({ result, onReset }: { result: BookingResult; onReset: () => void }) {
  return (
    <div className="animate-scale-in rounded-2xl border border-border-accent bg-surface p-6 text-center shadow-lg">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-bg text-3xl text-success">
        ✓
      </div>
      <h2 className="mt-4 text-xl font-bold text-text">Appointment Booked!</h2>
      <p className="mt-1 text-sm text-text-muted">
        A confirmation email has been sent to <span className="font-medium text-text">{result.patientEmail || "your email"}</span>.
      </p>

      <div className="mt-6 rounded-xl border border-border-accent bg-accent-soft p-4 text-left">
        <div className="text-xs font-semibold tracking-wide text-accent uppercase">Appointment Reference</div>
        <div className="mt-1 font-mono text-2xl font-bold text-accent">{result.referenceNumber}</div>
      </div>

      <dl className="mt-4 divide-y divide-border text-left">
        <Row label="Patient" value={result.patientName} />
        <Row label="Service" value={result.serviceName} />
        <Row label="Dentist" value={result.dentistName} />
        <Row label="Date" value={result.date} />
        <Row label="Time" value={result.time} />
        <Row label="Status" value="Pending confirmation" />
      </dl>

      <button onClick={onReset} className="gradient-gold mt-6 w-full rounded-lg py-3 font-semibold text-[#0E0F10] shadow transition-all duration-200 hover:opacity-90">
        Book another appointment
      </button>
      <Link href="/" className="mt-3 block text-sm font-medium text-accent hover:text-accent-hover transition-colors duration-200">
        Return home
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="text-sm font-medium text-accent hover:text-accent-hover transition-colors duration-200">
      ← {label}
    </button>
  );
}

function EmptyState({ title, message, icon }: { title: string; message: string; icon: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-surface py-16 text-center">
      <div className="text-4xl">{icon}</div>
      <h3 className="mt-3 text-lg font-semibold text-text">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-text-muted">{message}</p>
    </div>
  );
}
