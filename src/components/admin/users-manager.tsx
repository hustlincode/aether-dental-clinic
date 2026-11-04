"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createColumnHelper, type ColumnFiltersState, type PaginationState } from "@tanstack/react-table";
import { KeyRound, MoreHorizontal, Pencil, Plus, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { staffRoleLabel } from "@/lib/staff-roles";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, DataTablePagination, DataTableToolbar, useDataTable, type FilterableDataTableFeatures } from "./data-table";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { PageContainer } from "./page-container";
import { PageHeader } from "./page-header";
import { TableSkeleton } from "./table-skeleton";

type ManagedRole = "RECEPTIONIST" | "ASSISTANT" | "DENTIST";
type DentistOption = { id: string; name: string; status: string };
interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  dentist: DentistOption | null;
  isProtected: boolean;
}
type UserAction = { kind: "edit" | "password"; user: StaffUser } | { kind: "create" };
const MANAGED_ROLES: ManagedRole[] = ["RECEPTIONIST", "ASSISTANT", "DENTIST"];
const columnHelper = createColumnHelper<FilterableDataTableFeatures, StaffUser>();

export function UsersManager({ isDemo }: { isDemo: boolean }) {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [action, setAction] = useState<UserAction | null>(null);
  const [statusTarget, setStatusTarget] = useState<StaffUser | null>(null);
  const [busy, setBusy] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const query = new URLSearchParams({ page: String(pagination.pageIndex + 1), pageSize: String(pagination.pageSize) });
  if (search.trim()) query.set("search", search.trim());
  for (const filter of filters) query.set(filter.id, String(filter.value));
  const queryString = query.toString();

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/admin/users?${queryString}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "Unable to load users.");
        if (controller.signal.aborted) return;
        setUsers(body.data.users);
        setTotal(body.data.total);
        setPagination(current => {
          const last = Math.max(0, Math.ceil(body.data.total / current.pageSize) - 1);
          return current.pageIndex > last ? { ...current, pageIndex: last } : current;
        });
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load users.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [queryString, refresh]);

  function reload() { setLoading(true); setRefresh(value => value + 1); }

  function restoreFocus() {
    const target = returnFocus.current;
    if (target?.isConnected && !(target as HTMLButtonElement).disabled) target.focus();
    else addButton.current?.focus();
  }

  async function toggleStatus(user: StaffUser) {
    if (busy) return;
    setStatusTarget(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !user.active }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to change login status.");
      toast.success(user.active ? "Login deactivated." : "Login activated.");
      reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to change login status.");
    } finally { setBusy(false); }
  }

  const columns = columnHelper.columns([
    columnHelper.accessor("name", { header: "User", enableSorting: false, cell: info => (
      <div className="flex flex-col gap-1"><span className="font-medium text-text">{info.getValue()}</span><span className="text-xs text-text-muted">{info.row.original.email}</span></div>
    ) }),
    columnHelper.accessor("role", { header: "Role", enableSorting: false, filterFn: "equalsString", cell: info => (
      <div className="flex flex-col items-start gap-1"><Badge variant="outline">{staffRoleLabel(info.getValue())}</Badge>
        {info.row.original.dentist && <span className="text-xs text-text-muted">{info.row.original.dentist.name}</span>}
        {info.getValue() === "DENTIST" && !info.row.original.dentist && <span className="text-xs text-warning">Profile link required</span>}
      </div>
    ) }),
    columnHelper.accessor(user => String(user.active), { id: "active", header: "Login status", enableSorting: false, filterFn: "equalsString", cell: info => <Badge variant="secondary">{info.row.original.active ? "Active" : "Inactive"}</Badge> }),
    columnHelper.display({ id: "actions", header: "Actions", cell: info => {
      const user = info.row.original;
      if (isDemo || user.isProtected) return <span className="text-xs text-text-muted">Read-only</span>;
      return <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" disabled={busy || loading} onClick={event => { returnFocus.current = event.currentTarget; }} aria-label={`Actions for ${user.name}`}><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setAction({ kind: "edit", user })}><Pencil aria-hidden />Edit user</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAction({ kind: "password", user })}><KeyRound aria-hidden />Reset password</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setStatusTarget(user)}>{user.active ? "Deactivate login" : "Activate login"}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>;
    } }),
  ]);
  const table = useDataTable({ columns, data: users, options: {
    manualPagination: true, manualFiltering: true, manualSorting: true, rowCount: total, autoResetPageIndex: false,
    state: { pagination, columnFilters: filters, globalFilter: search }, onPaginationChange: setPagination,
    onColumnFiltersChange: updater => { setFilters(updater); setPagination(value => ({ ...value, pageIndex: 0 })); },
    onGlobalFilterChange: updater => { setSearch(value => (typeof updater === "function" ? updater(value) : updater) || ""); setPagination(value => ({ ...value, pageIndex: 0 })); },
  } });

  return <PageContainer>
    <PageHeader eyebrow="Administration" title="Users" description="Manage staff logins and roles. Dentist profiles and schedules stay in Dentists." actions={<>
      {!isDemo && <Button ref={addButton} variant="primary" onClick={event => { returnFocus.current = event.currentTarget; setAction({ kind: "create" }); }}><Plus aria-hidden />Add user</Button>}
      <Button variant="outline" onClick={reload}><RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />Refresh</Button>
    </>} />
    <DataTableToolbar table={table} searchPlaceholder="Search users..." searchMaxLength={200} filters={[
      { columnId: "role", label: "roles", options: ["ADMIN", ...MANAGED_ROLES].map(role => ({ value: role, label: staffRoleLabel(role) })) },
      { columnId: "active", label: "login statuses", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }] },
    ]} />
    <div className="card-surface overflow-hidden" aria-busy={loading}>
      {error ? <ErrorState title="Unable to load users" message={error} onRetry={reload} />
        : loading && users.length === 0 ? <TableSkeleton rows={6} columns={4} />
          : users.length === 0 ? <EmptyState icon={Users} title="No users found" description="Try adjusting your search or filters." />
            : <><div className={cn("overflow-x-auto", loading && "opacity-60")}><DataTable table={table} /></div><DataTablePagination table={table} className="border-t border-border px-4 py-3" /></>}
    </div>
    {action && <UserDialog action={action} onClose={() => setAction(null)} onReturnFocus={restoreFocus} onSaved={() => { setAction(null); reload(); }} />}
    <ConfirmDialog open={!!statusTarget} title={statusTarget?.active ? "Deactivate login?" : "Activate login?"}
      message={`${statusTarget?.name ?? "This user"} will ${statusTarget?.active ? "lose" : "regain"} login access. Dentist booking availability is managed separately.`}
      confirmLabel={statusTarget?.active ? "Deactivate login" : "Activate login"} destructive={statusTarget?.active}
      onCancel={() => { setStatusTarget(null); requestAnimationFrame(restoreFocus); }} onConfirm={() => { if (statusTarget) { void toggleStatus(statusTarget); requestAnimationFrame(restoreFocus); } }} />
  </PageContainer>;
}

function UserDialog({ action, onClose, onSaved, onReturnFocus }: { action: UserAction; onClose: () => void; onSaved: () => void; onReturnFocus: () => void }) {
  const user = action.kind === "create" ? null : action.user;
  const passwordOnly = action.kind === "password";
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<ManagedRole>((user?.role as ManagedRole) ?? "RECEPTIONIST");
  const [active, setActive] = useState(user?.active ?? true);
  const [dentistId, setDentistId] = useState(user?.dentist?.id ?? "");
  const [password, setPassword] = useState("");
  const [dentists, setDentists] = useState<DentistOption[]>([]);
  const [optionsError, setOptionsError] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsRefresh, setOptionsRefresh] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>( {} );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (passwordOnly || role !== "DENTIST") return;
    const controller = new AbortController();
    fetch(`/api/admin/users/dentist-options${user ? `?userId=${encodeURIComponent(user.id)}` : ""}`, { signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.message || "Unable to load Dentist profiles."); return body.data; })
      .then(data => { if (!controller.signal.aborted) { setDentists(data); setOptionsError(""); } })
      .catch(cause => { if (!controller.signal.aborted) setOptionsError(cause instanceof Error ? cause.message : "Unable to load Dentist profiles."); })
      .finally(() => { if (!controller.signal.aborted) setOptionsLoading(false); });
    return () => controller.abort();
  }, [passwordOnly, role, user, optionsRefresh]);

  function showErrors(message: string, fields: Record<string, string>) {
    setError(message); setErrors(fields);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields: Record<string, string> = {};
    if (!passwordOnly) {
      if (name.trim().length < 2) fields.name = "Enter at least 2 characters.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fields.email = "Enter a valid email address.";
      if (role === "DENTIST" && !dentistId) fields.dentistId = "Select a Dentist profile.";
    }
    if (passwordOnly || !user) {
      if ([...password].length < 12) fields.password = "Use at least 12 characters.";
      else if (new TextEncoder().encode(password).length > 72) fields.password = "Use at most 72 UTF-8 bytes.";
    }
    if (Object.keys(fields).length) { showErrors("Check the highlighted fields.", fields); return; }
    setSaving(true); setError(""); setErrors({});
    try {
      const response = await fetch(passwordOnly ? `/api/admin/users/${user!.id}/password` : user ? `/api/admin/users/${user.id}` : "/api/admin/users", {
        method: passwordOnly || !user ? "POST" : "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passwordOnly ? { password } : { name, email, role, active, dentistId: role === "DENTIST" ? dentistId : null, ...(!user ? { password } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) {
        const details: Record<string, string> = {};
        for (const [field, messages] of Object.entries(body.details ?? {})) if (Array.isArray(messages) && typeof messages[0] === "string") details[field] = messages[0];
        showErrors(body.message || "Unable to save user.", details);
        return;
      }
      setPassword("");
      toast.success(passwordOnly ? "Password reset. Existing sessions have been revoked." : user ? "User updated." : "User created.");
      onSaved();
    } catch { showErrors("Unable to save user. Please try again.", {}); }
    finally { setSaving(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent showCloseButton={false} onCloseAutoFocus={event => { event.preventDefault(); onReturnFocus(); }} className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>{passwordOnly ? "Reset password" : user ? "Edit user" : "Add user"}</DialogTitle>
        <DialogDescription>{passwordOnly ? `Set a new password for ${user!.name}. Share it outside this app. Resetting revokes existing sessions.` : "Manage login access independently of Dentist booking availability."}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {error && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-control border border-error/20 bg-error-bg px-4 py-3 text-sm text-error">{error}</div>}
        <FieldGroup>
          {!passwordOnly && <>
            <Field data-invalid={!!errors.name}><FieldLabel htmlFor="user-name">Full name</FieldLabel><Input id="user-name" autoFocus value={name} onChange={event => setName(event.target.value)} maxLength={100} required aria-invalid={!!errors.name} aria-describedby={errors.name ? "user-name-error" : undefined} /><FieldError id="user-name-error">{errors.name}</FieldError></Field>
            <Field data-invalid={!!errors.email}><FieldLabel htmlFor="user-email">Email</FieldLabel><Input id="user-email" type="email" autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required aria-invalid={!!errors.email} aria-describedby={errors.email ? "user-email-error" : undefined} /><FieldError id="user-email-error">{errors.email}</FieldError></Field>
            <Field data-invalid={!!errors.role}><FieldLabel htmlFor="user-role">Role</FieldLabel><Select value={role} onValueChange={value => { setRole(value as ManagedRole); setOptionsLoading(true); }}><SelectTrigger id="user-role" aria-invalid={!!errors.role}><SelectValue /></SelectTrigger><SelectContent>{MANAGED_ROLES.map(value => <SelectItem key={value} value={value}>{staffRoleLabel(value)}</SelectItem>)}</SelectContent></Select><FieldError>{errors.role}</FieldError></Field>
            {role === "DENTIST" && <Field data-invalid={!!errors.dentistId}><FieldLabel htmlFor="user-dentist">Dentist profile</FieldLabel><Select value={dentistId || undefined} onValueChange={setDentistId} disabled={optionsLoading || !!optionsError}><SelectTrigger id="user-dentist" aria-invalid={!!errors.dentistId} aria-describedby="user-dentist-help"><SelectValue placeholder={optionsLoading ? "Loading profiles..." : "Select a profile"} /></SelectTrigger><SelectContent>{dentists.map(dentist => <SelectItem key={dentist.id} value={dentist.id}>{dentist.name}{dentist.status !== "ACTIVE" ? " (inactive)" : ""}</SelectItem>)}</SelectContent></Select>
              <FieldDescription id="user-dentist-help">Create clinical profiles and schedules in Dentists first. Each profile supports one login.</FieldDescription>
              {optionsError && <><FieldError>{optionsError}</FieldError><Button type="button" variant="outline" onClick={() => { setOptionsLoading(true); setOptionsRefresh(value => value + 1); }}>Retry profiles</Button></>}
              {!optionsLoading && !optionsError && dentists.length === 0 && <FieldDescription>No unlinked profiles available. Create one in Dentists first.</FieldDescription>}
              <FieldError>{errors.dentistId}</FieldError></Field>}
            <Field><FieldLabel htmlFor="user-active">Login status</FieldLabel><Select value={String(active)} onValueChange={value => setActive(value === "true")}><SelectTrigger id="user-active"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">Active</SelectItem><SelectItem value="false">Inactive</SelectItem></SelectContent></Select></Field>
          </>}
          {(passwordOnly || !user) && <Field data-invalid={!!errors.password}><FieldLabel htmlFor="user-password">{passwordOnly ? "New password" : "Password"}</FieldLabel><Input id="user-password" type="password" autoFocus={passwordOnly} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} minLength={12} required aria-invalid={!!errors.password} aria-describedby="user-password-help user-password-error" /><FieldDescription id="user-password-help">At least 12 characters, at most 72 UTF-8 bytes. Share credentials outside this app.</FieldDescription><FieldError id="user-password-error">{errors.password}</FieldError></Field>}
        </FieldGroup>
        <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" variant="primary" disabled={saving || (!passwordOnly && role === "DENTIST" && (optionsLoading || !!optionsError))}>{saving ? "Saving..." : passwordOnly ? "Reset password" : user ? "Save changes" : "Create user"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
