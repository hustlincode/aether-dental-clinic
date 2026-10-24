"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminLoading from "@/app/admin/loading";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DatePickerField } from "@/components/admin/date-picker-field";
import { TimeField } from "@/components/admin/time-field";
import { clinicDateKey } from "@/lib/clinic-time";
import { PageContainer } from "./page-container";
import { PageHeader } from "./page-header";
import { SectionCard } from "./section-card";
import { ErrorState } from "./error-state";

interface Configuration {
  address: string | null;
  phone: string | null;
  email: string | null;
  openingTime: string;
  closingTime: string;
  lunchBreakStart: string | null;
  lunchBreakEnd: string | null;
  updatedAt: string;
}
interface Closure { id: string; date: string; reason: string | null }
interface Feedback {
  message: string;
  fields?: Record<string, string[]>;
  stale?: boolean;
  appointmentCount?: number;
  appointments?: { id: string; referenceNumber: string; date: string; startTime: string; endTime: string }[];
}
type Section = "contact" | "hours";
const contactFields = ["address", "phone", "email"] as const;
const hoursFields = ["openingTime", "closingTime", "lunchBreakStart", "lunchBreakEnd"] as const;
const labels = { address: "Address", phone: "Public phone", email: "Public email", openingTime: "Opening time", closingTime: "Closing time", lunchBreakStart: "Lunch starts (optional)", lunchBreakEnd: "Lunch ends (optional)" };

function FeedbackMessage({ feedback, reload }: { feedback?: Feedback; reload: () => void }) {
  if (!feedback) return null;
  return <div role="alert" className="space-y-2 text-sm text-error">
    <p>{feedback.message}</p>
    {feedback.appointmentCount !== undefined && <>
      <p>{feedback.appointmentCount} existing appointment(s) conflict. Resolve them before changing availability.</p>
      <ul className="list-inside list-disc">{feedback.appointments?.map((a) => <li key={a.id}>{a.referenceNumber} — {a.date.slice(0, 10)}, {a.startTime}–{a.endTime}</li>)}</ul>
      <Link href="/admin/appointments" className="underline">Review appointments</Link>
    </>}
    {feedback.fields?.form && <p>{feedback.fields.form.join(" ")}</p>}
    {feedback.stale && <div><p>Reload current settings before saving again. Reloading replaces unsaved edits.</p><Button type="button" variant="outline" onClick={reload}>Reload settings</Button></div>}
  </div>;
}

export function ConfigurationManager({ readOnly }: { readOnly: boolean }) {
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [draft, setDraft] = useState<Configuration | null>(null);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [saving, setSaving] = useState<Section | null>(null);
  const [feedback, setFeedback] = useState<Partial<Record<Section, Feedback>>>({});
  const [closureFeedback, setClosureFeedback] = useState<Feedback>();
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [closureBusy, setClosureBusy] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<Closure | null>(null);

  function reload() { setLoading(true); setLoadError(""); setRefresh((value) => value + 1); }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const responses = await Promise.all([fetch("/api/admin/configuration"), fetch("/api/admin/clinic-closures")]);
        const bodies = await Promise.all(responses.map((response) => response.json()));
        const failed = responses.findIndex((response) => !response.ok);
        if (failed !== -1) throw new Error(bodies[failed].message || "Unable to load configuration.");
        if (!bodies[0].data) throw new Error("Clinic settings are missing. Complete clinic setup before using configuration.");
        if (!cancelled) {
          setConfiguration(bodies[0].data); setDraft(bodies[0].data); setClosures(bodies[1].data);
          setFeedback({}); setClosureFeedback(undefined);
        }
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Unable to load configuration.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [refresh]);

  async function save(event: React.FormEvent, section: Section) {
    event.preventDefault();
    if (!draft || !configuration || readOnly || saving) return;
    setSaving(section); setFeedback((current) => ({ ...current, [section]: undefined }));
    const fields = section === "contact" ? contactFields : hoursFields;
    const values = Object.fromEntries(fields.map((field) => [field, draft[field] || null]));
    try {
      const response = await fetch("/api/admin/configuration", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section, updatedAt: configuration.updatedAt, ...values }) });
      const body = await response.json();
      if (!response.ok) {
        const details = body.details;
        setFeedback((current) => ({ ...current, [section]: {
          message: body.message || "Unable to save settings.",
          fields: response.status === 422 ? details : undefined,
          stale: response.status === 409 && details?.appointmentCount === undefined,
          appointmentCount: details?.appointmentCount, appointments: details?.appointments,
        } }));
        return;
      }
      const saved = body.data as Configuration;
      setConfiguration(saved);
      setDraft((current) => current ? { ...current, ...Object.fromEntries(fields.map((field) => [field, saved[field]])), updatedAt: saved.updatedAt } : saved);
      toast.success(section === "contact" ? "Contact details saved." : "Operating hours saved.");
    } catch { setFeedback((current) => ({ ...current, [section]: { message: "Unable to save settings. Check your connection and try again." } })); }
    finally { setSaving(null); }
  }

  async function mutateClosure(remove?: Closure) {
    if (readOnly || closureBusy) return;
    setClosureBusy(true); setClosureFeedback(undefined);
    try {
      const response = await fetch(`/api/admin/clinic-closures${remove ? `/${remove.id}` : ""}`, remove ? { method: "DELETE" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, reason: reason.trim() || undefined }) });
      const body = await response.json();
      if (!response.ok) {
        setClosureFeedback({ message: body.message || "Unable to update closures.", fields: response.status === 422 ? body.details : undefined, appointmentCount: body.details?.appointmentCount, appointments: body.details?.appointments });
        return;
      }
      if (remove) setClosures((current) => current.filter((item) => item.id !== remove.id));
      else { setClosures((current) => [...current, body.data].sort((a, b) => a.date.localeCompare(b.date))); setDate(""); setReason(""); }
      toast.success(remove ? "Clinic closure removed." : "Clinic closure added.");
    } catch { setClosureFeedback({ message: "Unable to update closures. Check your connection and try again." }); }
    finally { setClosureBusy(false); setPendingRemove(null); }
  }

  if (loading) return <div role="status" aria-label="Loading configuration"><AdminLoading /></div>;

  return <PageContainer>
    <PageHeader title="Configuration" description="Manage Aether Dental contact details, operating hours, and clinic closures." />
    {readOnly && <p role="note" className="rounded-control border border-border bg-surface-alt p-4 text-sm text-text-secondary">This is a read-only demo. Sign in with a staff account to make changes.</p>}
    {loadError ? <ErrorState title="Unable to load configuration" message={loadError} onRetry={reload} />
      : draft && configuration && <>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {(["contact", "hours"] as const).map((section) => <SectionCard key={section} title={section === "contact" ? "Contact details" : "Operating hours"} description={section === "contact" ? "Aether Dental branding stays fixed. Empty optional contact fields are hidden publicly." : "Changes take effect immediately in Manila time. Dentist schedules still apply. Conflicting appointments must be resolved first."}>
            <form onSubmit={(event) => void save(event, section)} className="space-y-4">
              <fieldset disabled={readOnly || saving !== null} className="space-y-4">
                {(section === "contact" ? contactFields : hoursFields).map((field) => (
                  section === "hours" ? (
                    <TimeField
                      key={field}
                      disabled={readOnly || saving !== null}
                      id={field}
                      label={labels[field]}
                      value={draft[field] ?? ""}
                      onChange={(value) => setDraft({ ...draft, [field]: value })}
                      required={field === "openingTime" || field === "closingTime"}
                      error={feedback[section]?.fields?.[field]?.join(" ")}
                    />
                  ) : (
                    <div key={field}>
                      <label htmlFor={field} className="mb-1 block text-sm font-medium text-text-secondary">{labels[field]}</label>
                      <Input id={field} type={field === "email" ? "email" : field === "phone" ? "tel" : "text"} required={false} value={draft[field] ?? ""} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} aria-invalid={Boolean(feedback[section]?.fields?.[field])} aria-describedby={feedback[section]?.fields?.[field] ? `${field}-error` : undefined} />
                      {feedback[section]?.fields?.[field] && <p id={`${field}-error`} className="mt-1 text-sm text-error">{feedback[section]?.fields?.[field].join(" ")}</p>}
                    </div>
                  )
                ))}
                {section === "hours" && <p className="text-sm text-text-muted">Leave both lunch fields empty for no lunch break. Overnight hours are not supported.</p>}
                <Button type="submit" variant="primary" disabled={!(section === "contact" ? contactFields : hoursFields).some((field) => (draft[field] || "") !== (configuration[field] || ""))}>{saving === section ? "Saving…" : section === "contact" ? "Save contact details" : "Save operating hours"}</Button>
              </fieldset>
              <FeedbackMessage feedback={feedback[section]} reload={reload} />
            </form>
          </SectionCard>)}
        </div>
        <SectionCard title="Clinic closures" description="Close the whole clinic for one date. Existing appointments are preserved; conflicting closures are rejected. Removing a closure restores availability according to clinic and dentist schedules.">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>{closures.length === 0 ? <p className="text-sm text-text-muted">No clinic closures scheduled.</p> : <ul className="divide-y divide-border">{closures.map((closure) => <li key={closure.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0"><p className="font-medium text-text">{closure.date.slice(0, 10)}</p>{closure.reason && <p className="break-words text-sm text-text-muted">Internal: {closure.reason}</p>}</div>
              <Button type="button" variant="outline" disabled={readOnly || closureBusy} onClick={() => setPendingRemove(closure)} aria-label={`Remove closure for ${closure.date.slice(0, 10)}`}>Remove</Button>
            </li>)}</ul>}</div>
            <form onSubmit={(event) => { event.preventDefault(); void mutateClosure(); }} className="space-y-4">
              <fieldset disabled={readOnly || closureBusy} className="space-y-4">
                <DatePickerField
                  id="closure-date"
                  label="Closure date (Manila)"
                  value={date}
                  onChange={setDate}
                  min={clinicDateKey()}
                  required
                  error={closureFeedback?.fields?.date?.join(" ")}
                />
                <div><label htmlFor="closure-reason" className="mb-1 block text-sm font-medium text-text-secondary">Internal reason (optional)</label><Input id="closure-reason" value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} aria-describedby="closure-reason-help" aria-invalid={Boolean(closureFeedback?.fields?.reason)} /><p id="closure-reason-help" className="mt-1 text-sm text-text-muted">Only staff can see this reason.</p>{closureFeedback?.fields?.reason && <p className="mt-1 text-sm text-error">{closureFeedback.fields.reason.join(" ")}</p>}</div>
                <Button type="submit" variant="primary" disabled={!date}>{closureBusy ? "Updating…" : "Add clinic closure"}</Button>
              </fieldset>
              <FeedbackMessage feedback={closureFeedback} reload={reload} />
            </form>
          </div>
        </SectionCard>
      </>}
    <ConfirmDialog open={pendingRemove !== null} title="Remove clinic closure?" message={pendingRemove ? `Make ${pendingRemove.date.slice(0, 10)} available according to clinic and dentist schedules?` : ""} confirmLabel="Remove closure" onConfirm={() => { if (pendingRemove) void mutateClosure(pendingRemove); }} onCancel={() => setPendingRemove(null)} />
  </PageContainer>;
}
