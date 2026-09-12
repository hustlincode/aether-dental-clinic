"use client";

import { useEffect, useState } from "react";
import { Eye, MoreHorizontal, Pencil, Plus, RefreshCw, ToggleLeft, ToggleRight, UserX, Users } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";
import { StatusBadge } from "./status-badge";
import { PatientFormModal, type PatientFormValues, type PatientFormInitialData } from "./patient-form-modal";
import { PatientDetails } from "./patient-details";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  DataTable,
  DataTableToolbar,
  DataTablePagination,
  useDataTable,
  type FilterableDataTableFeatures,
} from "./data-table";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { PageContainer } from "@/components/admin/page-container";
import { PageHeader } from "@/components/admin/page-header";
import { TableSkeleton } from "@/components/admin/table-skeleton";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Patient extends PatientFormInitialData {
  createdAt: string;
  updatedAt: string;
  _count: { appointments: number };
  appointments: { appointmentDate: string; status: string; startTime: string }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Columns (module-scope helper for stable reference) ──────────────────────

const columnHelper = createColumnHelper<FilterableDataTableFeatures, Patient>();

// ─── Main Component ──────────────────────────────────────────────────────────

export function PatientsManager({ role }: { role: string }) {
  const canManage = role === "ADMIN" || role === "RECEPTIONIST";

  // List state
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal + drawer state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  // ─── Data fetching ───────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    fetch("/api/patients?all=true")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message);
        if (!cancelled) {
          const raw = body.data;
          const list: Patient[] = Array.isArray(raw) ? raw : raw?.patients ?? [];
          setPatients(list);
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
  }, [refreshKey]);

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
      toast.success("Patient added successfully.");
      setModalOpen(false);
      setEditingPatient(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create patient.");
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
      toast.success("Patient updated successfully.");
      setModalOpen(false);
      setEditingPatient(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update patient.");
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
      toast.success(`Patient ${next === "ACTIVE" ? "activated" : "deactivated"} successfully.`);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update patient status.");
    }
  }

  // ─── Table columns ──────────────────────────────────────────────────────

  const columns = columnHelper.columns([
    columnHelper.accessor((p) => `${p.firstName} ${p.lastName}`, {
      id: "patient",
      header: "Patient",
      cell: (info) => {
        const patient = info.row.original;
        return (
          <button
            onClick={() => setDetailsId(patient.id)}
            className="flex items-center gap-3 text-left"
            title="View patient details"
          >
            <span className="gradient-gold flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-primary-foreground">
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
        );
      },
    }),
    columnHelper.accessor((p) => p.phone ?? "", {
      id: "phone",
      header: "Phone",
      meta: { cellClassName: "hidden md:table-cell" },
      cell: (info) => (
        <span className="whitespace-nowrap text-text-secondary">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor((p) => p._count?.appointments ?? 0, {
      id: "appointments",
      header: "Appointments",
      filterFn: (row, columnId, filterValue) => {
        const n = row.getValue(columnId) as number;
        if (filterValue === "has") return n > 0;
        if (filterValue === "none") return n === 0;
        return true;
      },
      cell: (info) => (
        <span className="text-text-secondary">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor(
      (p) => {
        const last = p.appointments?.[0];
        return last ? `${last.appointmentDate}T${last.startTime}` : "";
      },
      {
        id: "lastAppointment",
        header: "Last Appointment",
        meta: { cellClassName: "hidden lg:table-cell" },
        cell: (info) => {
          const patient = info.row.original;
          const lastAppt = patient.appointments?.[0];
          if (!lastAppt) return <span className="text-text-muted">—</span>;
          return (
            <div className="flex flex-col items-start gap-1">
              <span className="text-text-secondary">
                {fmtDate(lastAppt.appointmentDate)} · {fmtTime(lastAppt.startTime)}
              </span>
              <StatusBadge status={lastAppt.status} />
            </div>
          );
        },
      }
    ),
    columnHelper.accessor((p) => p.status, {
      id: "status",
      header: "Status",
      filterFn: "equalsString",
      cell: (info) => (
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            info.getValue() === "ACTIVE" ? "bg-success-bg text-success" : "bg-neutral-bg text-neutral-c"
          }`}
        >
          {info.getValue() === "ACTIVE" ? "Active" : "Inactive"}
        </span>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: () => <span className="block text-right">Actions</span>,
      meta: { cellClassName: "text-right" },
      cell: (info) => {
        const patient = info.row.original;
        return (
          <div className="flex items-center justify-end">
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="rounded-lg p-2 text-text-muted transition hover:bg-surface-alt hover:text-accent"
                      aria-label="More actions"
                    >
                      <MoreHorizontal size={15} />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>More actions</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="bg-surface">
                <DropdownMenuItem onSelect={() => setDetailsId(patient.id)}>
                  <Eye size={15} />
                  View patient
                </DropdownMenuItem>
                {canManage && (
                  <>
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditingPatient(patient);
                        setModalOpen(true);
                      }}
                    >
                      <Pencil size={15} />
                      Edit patient
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleToggleStatus(patient)}>
                      {patient.status === "ACTIVE" ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                      {patient.status === "ACTIVE" ? "Deactivate patient" : "Activate patient"}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    }),
  ]);

  // ─── Table instance (full client-side feature set) ──────────────────────

  const table = useDataTable({ columns, data: patients, getRowId: (p) => p.id });

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Clinic"
        title="Patients"
        description="Search, filter, and manage your patient records."
        actions={
          <>
            {canManage && (
              <button
                onClick={() => {
                  setEditingPatient(null);
                  setModalOpen(true);
                }}
                className="gradient-gold inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90"
              >
                <Plus size={18} />
                Add Patient
              </button>
            )}
            <button
              onClick={reload}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary transition-all hover:border-border-accent hover:bg-accent-soft hover:text-accent"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </>
        }
      />

      {/* Toolbar */}
      <DataTableToolbar
        table={table}
        searchPlaceholder="Search patients..."
        filters={[
          {
            columnId: "status",
            label: "statuses",
            options: [
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
            ],
          },
          {
            columnId: "appointments",
            label: "appointments",
            options: [
              { value: "has", label: "Has appointments" },
              { value: "none", label: "No appointments" },
            ],
          },
        ]}
        className="w-full"
      />

      {/* Table */}
      <div className="card-surface animate-fade-in overflow-hidden">
        {error ? (
          <ErrorState
            title="Unable to load patients"
            message={error}
            onRetry={reload}
            icon={UserX}
          />
        ) : loading && patients.length === 0 ? (
          <TableSkeleton rows={6} columns={5} />
        ) : patients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No patients found"
            description="Get started by adding your first patient to the clinic records."
            action={
              canManage ? (
                <button
                  onClick={() => {
                    setEditingPatient(null);
                    setModalOpen(true);
                  }}
                  className="gradient-gold inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-primary-foreground transition hover:opacity-90"
                >
                  <Plus size={18} />
                  Add Patient
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className={`overflow-x-auto ${loading ? "opacity-60 transition-opacity" : ""}`} aria-busy={loading}>
              <DataTable table={table} />
            </div>
            <DataTablePagination table={table} className="border-t border-border px-4 py-3" />
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
    </PageContainer>
  );
}
