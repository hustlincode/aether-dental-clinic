"use client";

import { useEffect, useState, useRef } from "react";
import { Plus, Pencil, ToggleLeft, ToggleRight, X, Stethoscope, MoreHorizontal } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  DataTable,
  DataTablePagination,
  DataTableToolbar,
  type FilterableDataTableFeatures,
  useDataTable,
} from "./data-table";
import { PageHeader } from "./page-header";
import { PageContainer } from "./page-container";
import { SectionCard } from "./section-card";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { TableSkeleton } from "./table-skeleton";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface Service {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: string; // Decimal serialized as string from Prisma
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
}

type FormData = {
  name: string;
  description: string;
  durationMin: string;
  price: string;
  status: "ACTIVE" | "INACTIVE";
};

type FormErrors = Record<string, string>;

const EMPTY_FORM: FormData = {
  name: "",
  description: "",
  durationMin: "",
  price: "",
  status: "ACTIVE",
};

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function formatPrice(price: string | number): string {
  const num = typeof price === "string" ? Number(price) : price;
  return num.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// â”€â”€â”€ Columns (module-scope for referential stability) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const columnHelper = createColumnHelper<FilterableDataTableFeatures, Service>();

// â”€â”€â”€ Service Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ServiceModal({
  open,
  onClose,
  onSave,
  initialData,
  title,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: FormData) => Promise<void>;
  initialData?: Service | null;
  title: string;
}) {
  // Form state is initialized lazily from `initialData`. The parent remounts
  // this component (via `key`) whenever it is opened, so the form always
  // reflects the target service without needing a sync effect.
  const [form, setForm] = useState<FormData>(() =>
    initialData
      ? {
          name: initialData.name,
          description: initialData.description || "",
          durationMin: String(initialData.durationMin),
          price: String(Number(initialData.price)),
          status: initialData.status,
        }
      : { ...EMPTY_FORM },
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Focus the name input when the modal opens (no state changes, just a focus).
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => nameRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open]);

  function validate(): boolean {
    const errs: FormErrors = {};
    if (!form.name.trim()) errs.name = "Service name is required.";
    if (!form.durationMin || isNaN(Number(form.durationMin)) || Number(form.durationMin) <= 0) {
      errs.durationMin = "Duration must be a positive number.";
    } else if (Number(form.durationMin) > 600) {
      errs.durationMin = "Duration cannot exceed 600 minutes.";
    }
    if (form.price === "" || isNaN(Number(form.price)) || Number(form.price) < 0) {
      errs.price = "Price cannot be negative.";
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
        name: form.name.trim(),
        description: form.description.trim() || "",
        durationMin: form.durationMin,
        price: form.price,
        status: form.status,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showCloseButton={false} className="w-full max-w-md gap-4 rounded-card border border-border-strong bg-surface p-6 shadow-xl sm:max-w-md">
        <div className="flex items-center justify-between mb-5">
          <DialogTitle className="text-lg font-bold text-text">{title}</DialogTitle>
          <button onClick={onClose} aria-label="Close" className="flex size-10 shrink-0 items-center justify-center rounded-control text-text-muted transition hover:bg-surface-alt hover:text-text">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Service Name <span className="text-error">*</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-control border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder-text-muted transition focus:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:ring-focus/40"
              placeholder="e.g. Dental Cleaning"
            />
            {errors.name && <p className="mt-1 text-xs text-error">{errors.name}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full rounded-control border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder-text-muted transition focus:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:ring-focus/40 resize-none"
              placeholder="Brief description of the service (optional)"
            />
          </div>

          {/* Duration + Price row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Duration (min) <span className="text-error">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={600}
                value={form.durationMin}
                onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))}
                className="w-full rounded-control border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder-text-muted transition focus:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:ring-focus/40"
                placeholder="30"
              />
              {errors.durationMin && <p className="mt-1 text-xs text-error">{errors.durationMin}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Price (â‚±) <span className="text-error">*</span>
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                className="w-full rounded-control border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder-text-muted transition focus:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:ring-focus/40"
                placeholder="0.00"
              />
              {errors.price && <p className="mt-1 text-xs text-error">{errors.price}</p>}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Status</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, status: f.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }))}
                className="flex h-11 items-center gap-2 rounded-control border border-border bg-surface-alt px-3 text-sm font-medium transition hover:border-border-accent"
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

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" size="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="default" disabled={saving}>
              {saving ? "Saving..." : initialData ? "Update Service" : "Create Service"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function ServicesManager() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  // â”€â”€â”€ Data fetching â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const [reloadKey, setReloadKey] = useState(0);

  /* Trigger a reload from an event handler. Loading is never toggled
     synchronously inside an effect body. */
  function reload() {
    setError("");
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  useEffect(() => {
    let cancelled = false;

    fetch("/api/services?all=true")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message);
        if (!cancelled) setServices(body.data || []);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unable to load services.";
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // â”€â”€â”€ CRUD handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async function handleCreate(data: FormData) {
    try {
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          description: data.description || null,
          durationMin: Number(data.durationMin),
          price: Number(data.price),
          status: data.status,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      toast.success("Service created successfully.");
      setModalOpen(false);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create service.");
      throw err;
    }
  }

  async function handleUpdate(data: FormData) {
    if (!editingService) return;
    try {
      const res = await fetch(`/api/services/${editingService.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          description: data.description || null,
          durationMin: Number(data.durationMin),
          price: Number(data.price),
          status: data.status,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      toast.success("Service updated successfully.");
      setModalOpen(false);
      setEditingService(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update service.");
      throw err;
    }
  }

  async function handleToggleStatus(service: Service) {
    const newStatus = service.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      const res = await fetch(`/api/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      toast.success(`Service ${newStatus === "ACTIVE" ? "activated" : "deactivated"} successfully.`);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update service status.");
    }
  }

  // â”€â”€â”€ Table columns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const columns = columnHelper.columns([
    columnHelper.accessor((s) => s.name, {
      id: "name",
      header: "Service",
      cell: (info) => <span className="font-medium text-text">{info.getValue()}</span>,
    }),
    columnHelper.accessor((s) => s.description ?? "", {
      id: "description",
      header: "Description",
      meta: { cellClassName: "hidden md:table-cell" },
      cell: (info) => (
        <span className="max-w-[200px] truncate text-text-secondary">
          {info.row.original.description || <span className="text-text-muted italic">No description</span>}
        </span>
      ),
    }),
    columnHelper.accessor((s) => s.durationMin, {
      id: "durationMin",
      header: "Duration",
      cell: (info) => <span className="text-text-secondary">{formatDuration(info.getValue())}</span>,
    }),
    columnHelper.accessor((s) => Number(s.price), {
      id: "price",
      header: "Price",
      cell: (info) => <span className="font-medium text-text">{formatPrice(info.getValue())}</span>,
    }),
    columnHelper.accessor((s) => s.status, {
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
    columnHelper.accessor(() => "", {
      id: "actions",
      header: () => <span className="block text-right">Actions</span>,
      meta: { cellClassName: "text-right" },
      enableSorting: false,
      cell: (info) => {
        const service = info.row.original;
        return (
          <div className="flex items-center justify-end">
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-xs" aria-label="More actions">
                      <MoreHorizontal aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>More actions</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="bg-surface">
                <DropdownMenuItem onSelect={() => { setEditingService(service); setModalOpen(true); }}>
                  <Pencil size={15} />
                  Edit service
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleToggleStatus(service)}>
                  {service.status === "ACTIVE" ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                  {service.status === "ACTIVE" ? "Deactivate service" : "Activate service"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    }),
  ]);

  // â”€â”€â”€ Table instance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const table = useDataTable({ columns, data: services, getRowId: (s) => s.id });

  // â”€â”€â”€ Derived state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const filteredCount = table.getFilteredRowModel().rows.length;
  const statusFilterValue = (table.getColumn("status")?.getFilterValue() as string | undefined) ?? "";

  // â”€â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Clinic"
        title="Services"
        description="Manage your clinic's services, pricing, and durations."
        actions={
          <Button
            variant="primary"
            size="default"
            onClick={() => {
              setEditingService(null);
              setModalOpen(true);
            }}
          >
            <Plus aria-hidden />
            Add Service
          </Button>
        }
      />

      {/* Table */}
      <SectionCard padded={false} className="animate-fade-in">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && services.length === 0 ? (
          <TableSkeleton />
        ) : services.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="No services found"
            description="Get started by adding your first service to the clinic catalog."
          />
        ) : (
          <>
            <div className={`p-4 ${loading ? "opacity-60 transition-opacity" : ""}`} aria-busy={loading}>
              <DataTableToolbar
                table={table}
                searchPlaceholder="Search services..."
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
              />
            </div>
            <div className="overflow-x-auto">
              <DataTable table={table} />
            </div>
            <DataTablePagination table={table} className="border-t border-border px-4 py-3" />
          </>
        )}
      </SectionCard>

      {/* Summary */}
      {!error && !loading && services.length > 0 && (
        <div className="text-right text-xs text-text-muted">
          {filteredCount} service{filteredCount !== 1 ? "s" : ""}
          {statusFilterValue && ` (${statusFilterValue.toLowerCase()})`}
        </div>
      )}

      {/* Modal */}
      <ServiceModal
        key={editingService ? editingService.id : "new"}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingService(null);
        }}
        onSave={editingService ? handleUpdate : handleCreate}
        initialData={editingService}
        title={editingService ? "Edit Service" : "Add New Service"}
      />
    </PageContainer>
  );
}
