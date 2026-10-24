"use client";

import { useEffect, useState } from "react";
import { Eye, MoreHorizontal, Pencil, Plus, RefreshCw, ToggleLeft, ToggleRight, UserX, Users } from "lucide-react";
import { type ColumnFiltersState, type PaginationState, type SortingState, createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";
import { StatusBadge } from "./status-badge";
import { Button } from "@/components/ui/button";
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsReturnFocus, setDetailsReturnFocus] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([{ id: "patient", desc: false }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);
  const qs = new URLSearchParams({
    page: String(pagination.pageIndex + 1), pageSize: String(pagination.pageSize),
    sort: sorting[0]?.id || "patient", order: sorting[0]?.desc ? "desc" : "asc",
  });
  if (search.trim()) qs.set("search", search.trim());
  for (const filter of columnFilters) {
    if (filter.id === "status") qs.set("status", String(filter.value));
    if (filter.id === "appointments") qs.set("hasAppointments", filter.value === "has" ? "1" : "0");
  }
  const queryString = qs.toString();

  // ─── Data fetching ───────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      fetch(`/api/patients?${queryString}`)
        .then(async (res) => {
          const body = await res.json();
          if (!res.ok) throw new Error(body.message);
          if (!cancelled) {
            const raw = body.data;
            const list: Patient[] = Array.isArray(raw) ? raw : raw?.patients ?? [];
            setPatients(list);
            const total = body.data?.pagination?.total ?? body.data?.total ?? 0;
            setTotal(total);
            const lastPage = Math.max(0, Math.ceil(total / 20) - 1);
            setPagination((current) => current.pageIndex > lastPage ? { ...current, pageIndex: lastPage } : current);
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load patients.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refreshKey, queryString]);

  function reload() {
    setLoading(true);
    setError("");
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
            data-patient-details-trigger={patient.id}
            onClick={() => { setDetailsReturnFocus(`[data-patient-details-trigger="${CSS.escape(patient.id)}"]`); setDetailsId(patient.id); setDetailsOpen(true); }}
            className="flex items-center gap-3 text-left"
            title="View patient details"
          >
            <span className="gradient-gold flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-xs font-bold text-primary-foreground">
              {initials(patient.firstName, patient.lastName)}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-text">
                {patient.firstName} {patient.lastName}
              </span>
              <span className="block max-w-[180px] truncate text-xs text-text-muted">
                {patient.email || "No email on file"}
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
        enableSorting: false,
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
          className={`inline-flex rounded-pill px-2.5 py-0.5 text-xs font-semibold ${
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
                    <Button variant="ghost" size="icon-xs" aria-label="More actions" data-patient-actions-trigger={patient.id}>
                      <MoreHorizontal aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>More actions</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="bg-surface">
                <DropdownMenuItem onSelect={() => {
                  setDetailsReturnFocus(`[data-patient-actions-trigger="${CSS.escape(patient.id)}"]`);
                  setDetailsId(patient.id);
                  setDetailsOpen(true);
                }}>
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

  const table = useDataTable({
    columns, data: patients, getRowId: (p) => p.id,
    options: {
      manualPagination: true, manualFiltering: true, manualSorting: true,
      rowCount: total, autoResetPageIndex: false, enableMultiSort: false,
      state: { pagination, sorting, columnFilters, globalFilter: search },
      onPaginationChange: setPagination,
      onSortingChange: (updater) => {
        setSorting(updater);
        setPagination((p) => ({ ...p, pageIndex: 0 }));
      },
      onColumnFiltersChange: (updater) => {
        setColumnFilters(updater);
        setPagination((p) => ({ ...p, pageIndex: 0 }));
      },
      onGlobalFilterChange: (updater) => {
        setSearch((current) => (typeof updater === "function" ? updater(current) : updater) || "");
        setPagination((p) => ({ ...p, pageIndex: 0 }));
      },
    },
  });

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
              <Button
                variant="primary"
                size="default"
                onClick={() => {
                  setEditingPatient(null);
                  setModalOpen(true);
                }}
              >
                <Plus aria-hidden />
                Add Patient
              </Button>
            )}
            <Button variant="outline" size="default" onClick={reload}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </Button>
          </>
        }
      />

      {/* Toolbar */}
      <DataTableToolbar
        table={table}
        searchPlaceholder="Search patients..."
        searchMaxLength={200}
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
            description={search || columnFilters.length ? "Try adjusting your search or filters." : "Get started by adding your first patient to the clinic records."}
            action={
              canManage ? (
                <Button
                  variant="primary"
                  size="default"
                  onClick={() => {
                    setEditingPatient(null);
                    setModalOpen(true);
                  }}
                >
                  <Plus aria-hidden />
                  Add Patient
                </Button>
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
      <PatientDetails key={detailsId || "closed"} open={detailsOpen} patientId={detailsId} returnFocusTo={detailsReturnFocus} onClose={() => setDetailsOpen(false)} />
    </PageContainer>
  );
}
