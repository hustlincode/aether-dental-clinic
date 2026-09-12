"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Stethoscope,
  ToggleLeft,
  ToggleRight,
  UserX,
} from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DentistFormModal, type DentistFormValues, type DentistFormInitialData } from "./dentist-form-modal";
import { DentistDetails } from "./dentist-details";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

interface Dentist extends DentistFormInitialData {
  createdAt: string;
  updatedAt: string;
  _count?: { appointments: number };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => !/^dr\.?$/i.test(p));
  if (parts.length === 0) return "?";
  const first = parts[0];
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  return `${first[0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

// ─── Columns (module-scope helper for stable reference) ──────────────────────

const columnHelper = createColumnHelper<FilterableDataTableFeatures, Dentist>();

// ─── Main Component ──────────────────────────────────────────────────────────

export function DentistsManager({ role }: { role: string }) {
  const canManage = role === "ADMIN";
  const router = useRouter();

  // List state
  const [dentists, setDentists] = useState<Dentist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal + drawer state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDentist, setEditingDentist] = useState<Dentist | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  // ─── Data fetching ───────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    fetch("/api/dentists?all=true")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message);
        if (!cancelled) {
          const raw = body.data;
          const list: Dentist[] = Array.isArray(raw) ? raw : [];
          setDentists(list);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load dentists.");
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

  async function handleCreate(data: DentistFormValues) {
    try {
      const res = await fetch("/api/dentists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          phone: data.phone || "",
          specialization: data.specialization,
          profileImage: data.profileImage || "",
          status: data.status,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const err = new Error(body.message || "Failed to create dentist.") as Error & { details?: unknown };
        err.details = body.details;
        throw err;
      }
      toast.success("Dentist added successfully.");
      setModalOpen(false);
      setEditingDentist(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create dentist.");
      throw err;
    }
  }

  async function handleUpdate(data: DentistFormValues) {
    if (!editingDentist) return;
    try {
      const res = await fetch(`/api/dentists/${editingDentist.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          phone: data.phone || "",
          specialization: data.specialization,
          profileImage: data.profileImage || "",
          status: data.status,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const err = new Error(body.message || "Failed to update dentist.") as Error & { details?: unknown };
        err.details = body.details;
        throw err;
      }
      toast.success("Dentist updated successfully.");
      setModalOpen(false);
      setEditingDentist(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update dentist.");
      throw err;
    }
  }

  async function handleToggleStatus(dentist: Dentist) {
    const next = dentist.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      const res = await fetch(`/api/dentists/${dentist.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      toast.success(`Dentist ${next === "ACTIVE" ? "activated" : "deactivated"} successfully.`);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update dentist status.");
    }
  }

  // ─── Table columns ──────────────────────────────────────────────────────

  const columns = columnHelper.columns([
    columnHelper.accessor((d) => d.name, {
      id: "dentist",
      header: "Dentist",
      cell: (info) => {
        const dentist = info.row.original;
        return (
          <button
            onClick={() => setDetailsId(dentist.id)}
            className="flex items-center gap-3 text-left"
            title="View dentist details"
          >
            <Avatar className="h-9 w-9">
              <AvatarImage src={dentist.profileImage || undefined} alt={dentist.name} />
              <AvatarFallback className="gradient-gold text-primary-foreground">
                {initials(dentist.name)}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0">
              <span className="block truncate font-medium text-text">{dentist.name}</span>
              <span className="block max-w-[180px] truncate text-xs text-text-muted">
                {dentist.email}
              </span>
            </span>
          </button>
        );
      },
    }),
    columnHelper.accessor((d) => d.phone ?? "", {
      id: "phone",
      header: "Phone",
      meta: { cellClassName: "hidden md:table-cell" },
      cell: (info) => (
        <span className="whitespace-nowrap text-text-secondary">{info.getValue() || "—"}</span>
      ),
    }),
    columnHelper.accessor((d) => d.specialization, {
      id: "specialization",
      header: "Specialization",
      meta: { cellClassName: "hidden lg:table-cell" },
      cell: (info) => (
        <span className="whitespace-nowrap text-text-secondary">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor((d) => d.status, {
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
        const dentist = info.row.original;
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
                <DropdownMenuItem onSelect={() => setDetailsId(dentist.id)}>
                  <Eye size={15} />
                  View dentist
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => router.push(`/admin/dentists/${dentist.id}`)}
                >
                  <CalendarClock size={15} />
                  Manage schedule
                </DropdownMenuItem>
                {canManage && (
                  <>
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditingDentist(dentist);
                        setModalOpen(true);
                      }}
                    >
                      <Pencil size={15} />
                      Edit dentist
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleToggleStatus(dentist)}>
                      {dentist.status === "ACTIVE" ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                      {dentist.status === "ACTIVE" ? "Deactivate dentist" : "Activate dentist"}
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

  const table = useDataTable({ columns, data: dentists, getRowId: (d) => d.id });

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Clinic"
        title="Dentists"
        description="Manage your dental team, specializations, and schedules."
        actions={
          <>
            {canManage && (
              <button
                onClick={() => {
                  setEditingDentist(null);
                  setModalOpen(true);
                }}
                className="gradient-gold inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90"
              >
                <Plus size={18} />
                Add Dentist
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
        searchPlaceholder="Search dentists..."
        filters={[
          {
            columnId: "status",
            label: "statuses",
            options: [
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
            ],
          },
        ]}
        className="w-full"
      />

      {/* Table */}
      <div className="card-surface animate-fade-in overflow-hidden">
        {error ? (
          <ErrorState
            title="Unable to load dentists"
            message={error}
            onRetry={reload}
            icon={UserX}
          />
        ) : loading && dentists.length === 0 ? (
          <TableSkeleton rows={6} columns={5} />
        ) : dentists.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="No dentists found"
            description="Get started by adding a dentist to your clinic team."
            action={
              canManage ? (
                <button
                  onClick={() => {
                    setEditingDentist(null);
                    setModalOpen(true);
                  }}
                  className="gradient-gold inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-primary-foreground transition hover:opacity-90"
                >
                  <Plus size={18} />
                  Add Dentist
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
      <DentistFormModal
        key={editingDentist ? editingDentist.id : "new"}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingDentist(null);
        }}
        onSave={editingDentist ? handleUpdate : handleCreate}
        initialData={editingDentist}
        title={editingDentist ? "Edit Dentist" : "Add New Dentist"}
      />

      {/* Details drawer */}
      <DentistDetails key={detailsId || "closed"} open={!!detailsId} dentistId={detailsId} onClose={() => setDetailsId(null)} />
    </PageContainer>
  );
}