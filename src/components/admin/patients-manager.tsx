"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Pencil, Plus, RefreshCw, Search, ToggleLeft, ToggleRight, UserX, Users } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { StatusBadge } from "./status-badge";
import { PatientFormModal, type PatientFormValues, type PatientFormInitialData } from "./patient-form-modal";
import { PatientDetails } from "./patient-details";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Patient extends PatientFormInitialData {
  createdAt: string;
  updatedAt: string;
  _count: { appointments: number };
  appointments: { appointmentDate: string; status: string; startTime: string }[];
}

interface PatientListResponse {
  patients: Patient[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 350;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPageItems(current: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, totalPages]);
  for (let p = current - 2; p <= current + 2; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const items: (number | "...")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) items.push("...");
    items.push(p);
    prev = p;
  }
  return items;
}

function initials(first: string, last: string): string {
  return `${(first[0] || "").toUpperCase()}${(last[0] || "").toUpperCase()}`;
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PatientsManager({ role }: { role: string }) {
  const { toast } = useToast();
  const canManage = role === "ADMIN" || role === "RECEPTIONIST";

  // List state
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters + pagination
  const [params, setParams] = useState({ page: 1, status: "", hasAppointments: "" });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal + drawer state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const { page, status: statusFilter, hasAppointments: hasAppointmentsFilter } = params;

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ─── Data fetching ───────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (statusFilter) qs.set("status", statusFilter);
    if (hasAppointmentsFilter) qs.set("hasAppointments", hasAppointmentsFilter);
    if (search) qs.set("search", search);

    fetch(`/api/patients?${qs.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message);
        if (!cancelled) {
          const data: PatientListResponse = body.data;
          setPatients(data.patients || []);
          setTotal(data.total ?? 0);
          setParams((cur) => (cur.page === data.page ? cur : { ...cur, page: data.page }));
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load patients.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, statusFilter, hasAppointmentsFilter, search, refreshKey, toast]);

  /* Loading is toggled by user actions (never synchronously inside the effect
     body), so the initial state starts as true and every interaction re-shows it. */
  function beginLoad() {
    setLoading(true);
    setError("");
  }

  function reload() {
    beginLoad();
    setRefreshKey((k) => k + 1);
  }

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      setParams((p) => (p.page === 1 ? p : { ...p, page: 1 }));
      beginLoad();
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleStatusChange(value: string) {
    setParams((p) => ({ ...p, status: value, page: 1 }));
    beginLoad();
  }

  function handleAppointmentsChange(value: string) {
    setParams((p) => ({ ...p, hasAppointments: value, page: 1 }));
    beginLoad();
  }

  function goToPage(p: number) {
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (p < 1 || p > totalPages) return;
    setParams((cur) => (cur.page === p ? cur : { ...cur, page: p }));
    beginLoad();
  }

  // ─── CRUD handlers ──────────────────────────────────────────────────────

  async function handleCreate(data: PatientFormValues) {
    try {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email || "",
          phone: data.phone,
          notes: data.notes || null,
          status: data.status,
          followUpEnabled: data.followUpEnabled,
          followUpDays: data.followUpDays,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const err = new Error(body.message || "Failed to create patient.") as Error & { details?: unknown };
        err.details = body.details;
        throw err;
      }
      toast("Patient added successfully.", "success");
      setModalOpen(false);
      setEditingPatient(null);
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to create patient.", "error");
      throw err;
    }
  }

  async function handleUpdate(data: PatientFormValues) {
    if (!editingPatient) return;
    try {
      const res = await fetch(`/api/patients/${editingPatient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email || "",
          phone: data.phone,
          notes: data.notes || null,
          status: data.status,
          followUpEnabled: data.followUpEnabled,
          followUpDays: data.followUpDays,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const err = new Error(body.message || "Failed to update patient.") as Error & { details?: unknown };
        err.details = body.details;
        throw err;
      }
      toast("Patient updated successfully.", "success");
      setModalOpen(false);
      setEditingPatient(null);
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update patient.", "error");
      throw err;
    }
  }

  async function handleToggleStatus(patient: Patient) {
    const next = patient.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      const res = await fetch(`/api/patients/${patient.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      toast(`Patient ${next === "ACTIVE" ? "activated" : "deactivated"} successfully.`, "success");
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update patient status.", "error");
    }
  }

  // ─── Render helpers ─────────────────────────────────────────────────────

  const hasFilters = Boolean(search || statusFilter || hasAppointmentsFilter);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Patients</h1>
          <p className="mt-1 text-sm text-text-muted">Search, filter, and manage your patient records.</p>
        </div>
        {canManage && (
          <button
            onClick={() => {
              setEditingPatient(null);
              setModalOpen(true);
            }}
            className="gradient-gold inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-[#0E0F10] transition hover:opacity-90"
          >
            <Plus size={18} />
            Add Patient
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search patients, email, or phone..."
            className="w-full rounded-lg border border-border bg-surface-alt py-2 pl-9 pr-3 text-sm text-text placeholder-text-muted transition focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <select
            value={hasAppointmentsFilter}
            onChange={(e) => handleAppointmentsChange(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          >
            <option value="">All appointments</option>
            <option value="1">Has appointments</option>
            <option value="0">No appointments</option>
          </select>
          <button
            onClick={reload}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary transition-all hover:border-border-accent hover:bg-accent-soft hover:text-accent"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 animate-fade-in overflow-hidden rounded-xl border border-border bg-surface shadow">
        {error ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-error-bg">
              <UserX size={24} className="text-error" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-text">Unable to load patients</h3>
            <p className="mt-1 max-w-sm text-sm text-text-muted">{error}</p>
            <button
              onClick={reload}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition hover:border-border-accent hover:bg-accent-soft hover:text-accent"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
          </div>
        ) : loading && patients.length === 0 ? (
          <div className="space-y-4 p-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex gap-4">
                <div className="h-10 w-10 rounded-full bg-surface-alt" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-surface-alt" />
                  <div className="h-3 w-1/2 rounded bg-surface-alt" />
                </div>
                <div className="h-4 w-1/6 rounded bg-surface-alt" />
                <div className="h-4 w-1/6 rounded bg-surface-alt" />
                <div className="h-4 w-1/6 rounded bg-surface-alt" />
              </div>
            ))}
          </div>
        ) : patients.length === 0 ? (
          hasFilters ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
                <Search size={24} className="text-accent" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-text">No patients match your search.</h3>
              <p className="mt-1 max-w-sm text-sm text-text-muted">
                Try another name, email, or phone number, or adjust your filters.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
                <Users size={24} className="text-accent" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-text">No patients found</h3>
              <p className="mt-1 max-w-sm text-sm text-text-muted">
                Get started by adding your first patient to the clinic records.
              </p>
              {canManage && (
                <button
                  onClick={() => {
                    setEditingPatient(null);
                    setModalOpen(true);
                  }}
                  className="gradient-gold mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-[#0E0F10] transition hover:opacity-90"
                >
                  <Plus size={18} />
                  Add Patient
                </button>
              )}
            </div>
          )
        ) : (
          <>
            <div className={`overflow-x-auto ${loading ? "opacity-60 transition-opacity" : ""}`} aria-busy={loading}>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-background-alt text-xs uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Patient</th>
                    <th className="hidden px-4 py-3 font-semibold md:table-cell">Phone</th>
                    <th className="px-4 py-3 font-semibold">Appointments</th>
                    <th className="hidden px-4 py-3 font-semibold lg:table-cell">Last Appointment</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {patients.map((patient) => {
                    const lastAppt = patient.appointments && patient.appointments.length > 0 ? patient.appointments[0] : null;
                    return (
                      <tr key={patient.id} className="transition-colors hover:bg-accent-soft">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setDetailsId(patient.id)}
                            className="flex items-center gap-3 text-left"
                            title="View patient details"
                          >
                            <span className="gradient-gold flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[#0E0F10]">
                              {initials(patient.firstName, patient.lastName)}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-text">
                                {patient.firstName} {patient.lastName}
                              </span>
                              <span className="block max-w-[180px] truncate text-xs text-text-muted">
                                {patient.email || "No email on file"}
                              </span>
                              <span
                                className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium ${
                                  patient.followUpEnabled ? "text-success" : "text-text-muted"
                                }`}
                                title={
                                  patient.followUpEnabled
                                    ? `Follow-up email ${patient.followUpDays === 1 ? "1 day" : `${patient.followUpDays} days`} after each visit`
                                    : "Follow-up emails disabled"
                                }
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${patient.followUpEnabled ? "bg-success" : "bg-neutral-c"}`} />
                                {patient.followUpEnabled
                                  ? `Follow-up ${patient.followUpDays === 1 ? "1 day" : `${patient.followUpDays} days`}`
                                  : "Follow-ups off"}
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-3 text-text-secondary md:table-cell">{patient.phone}</td>
                        <td className="px-4 py-3">
                          <span className="text-text-secondary">{patient._count.appointments}</span>
                        </td>
                        <td className="hidden px-4 py-3 lg:table-cell">
                          {lastAppt ? (
                            <div className="flex flex-col items-start gap-1">
                              <span className="text-text-secondary">
                                {fmtDate(lastAppt.appointmentDate)} · {fmtTime(lastAppt.startTime)}
                              </span>
                              <StatusBadge status={lastAppt.status} />
                            </div>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              patient.status === "ACTIVE" ? "bg-success-bg text-success" : "bg-neutral-bg text-neutral-c"
                            }`}
                          >
                            {patient.status === "ACTIVE" ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setDetailsId(patient.id)}
                              title="View patient"
                              className="rounded-lg p-2 text-text-muted transition hover:bg-surface-alt hover:text-accent"
                            >
                              <Eye size={15} />
                            </button>
                            {canManage && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingPatient(patient);
                                    setModalOpen(true);
                                  }}
                                  title="Edit patient"
                                  className="rounded-lg p-2 text-text-muted transition hover:bg-surface-alt hover:text-accent"
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  onClick={() => handleToggleStatus(patient)}
                                  title={patient.status === "ACTIVE" ? "Deactivate patient" : "Activate patient"}
                                  className={`rounded-lg p-2 transition ${
                                    patient.status === "ACTIVE"
                                      ? "text-text-muted hover:bg-error-bg hover:text-error"
                                      : "text-text-muted hover:bg-success-bg hover:text-success"
                                  }`}
                                >
                                  {patient.status === "ACTIVE" ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {total > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
                <p className="text-sm text-text-muted">
                  Showing {start}–{end} of {total}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => goToPage(page - 1)}
                    disabled={page <= 1}
                    aria-label="Previous page"
                    className="rounded-lg border border-border p-1.5 text-text-secondary transition-colors hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {getPageItems(page, totalPages).map((item, i) =>
                    item === "..." ? (
                      <span key={`ellipsis-${i}`} className="px-1.5 text-sm text-text-muted">
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => goToPage(item)}
                        aria-current={item === page ? "page" : undefined}
                        className={`min-w-[2rem] rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
                          item === page ? "bg-accent text-[#0E0F10]" : "text-text-secondary hover:bg-accent-soft hover:text-accent"
                        }`}
                      >
                        {item}
                      </button>
                    ),
                  )}
                  <button
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= totalPages}
                    aria-label="Next page"
                    className="rounded-lg border border-border p-1.5 text-text-secondary transition-colors hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      <PatientFormModal
        key={editingPatient ? editingPatient.id : "new"}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingPatient(null);
        }}
        onSave={editingPatient ? handleUpdate : handleCreate}
        initialData={editingPatient}
        title={editingPatient ? "Edit Patient" : "Add New Patient"}
      />

      {/* Details drawer */}
      <PatientDetails key={detailsId || "closed"} open={!!detailsId} patientId={detailsId} onClose={() => setDetailsId(null)} />
    </div>
  );
}