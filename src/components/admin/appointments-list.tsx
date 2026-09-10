"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarX, ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { StatusBadge } from "./status-badge";
import { useToast } from "@/components/ui/toast";

interface Appt {
  id: string;
  referenceNumber: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: string;
  patient: { firstName: string; lastName: string; phone: string | null; email: string | null };
  dentist: { name: string };
  service: { name: string };
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const ALLOWED = ["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"];
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

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

export function AppointmentsList({ role }: { role: string }) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [params, setParams] = useState({ page: 1, status: "", search: "" });
  const [appts, setAppts] = useState<Appt[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { page, status: statusFilter, search: searchFilter } = params;

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (statusFilter) qs.set("status", statusFilter);
    if (searchFilter) qs.set("search", searchFilter);

    fetch(`/api/appointments?${qs.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message);
        if (!cancelled) {
          setAppts(body.data?.items || []);
          setPagination(body.data?.pagination || null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load appointments.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, statusFilter, searchFilter, refreshKey]);

  /* Loading is toggled by user actions (never synchronously inside the effect),
     so the initial state starts as true and every interaction re-shows it. */
  function beginLoad() {
    setLoading(true);
    setError("");
  }

  function handleSearchChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setParams((p) => (p.search === value ? p : { ...p, search: value, page: 1 }));
      beginLoad();
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleStatusChange(value: string) {
    setParams((p) => ({ ...p, status: value, page: 1 }));
    beginLoad();
  }

  function refresh() {
    beginLoad();
    setRefreshKey((k) => k + 1);
  }

  function goToPage(p: number) {
    if (p < 1 || (pagination && p > pagination.totalPages)) return;
    setParams((cur) => (cur.page === p ? cur : { ...cur, page: p }));
    beginLoad();
  }

  async function changeStatus(id: string, next: string) {
    try {
      const res = await fetch(`/api/appointments/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, status: next } : a)));
      toast(`Appointment marked as ${next.replace("_", " ").toLowerCase()}.`, "success");
      if (body.email && !body.email.ok) {
        toast("Status updated, but the notification email could not be sent. Check SMTP settings.", "error");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Unable to update the appointment.", "error");
    }
  }

  const start = pagination && pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const end = pagination ? Math.min(pagination.page * pagination.pageSize, pagination.total) : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-text">Appointments</h1>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search patient name, email, or phone..."
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          >
            <option value="">All statuses</option>
            {ALLOWED.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary transition-all hover:border-border-accent hover:bg-accent-soft hover:text-accent"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-error/20 bg-error-bg px-4 py-3 text-sm text-error">{error}</div>
      )}

      <div className="mt-4 flex flex-col animate-fade-in overflow-hidden rounded-xl border border-border bg-surface shadow">
        {error ? null : loading && appts.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-text-muted">Loading appointments...</div>
        ) : appts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center text-sm text-text-muted">
            <CalendarX className="h-10 w-10 opacity-60" />
            <span>No appointments found.</span>
          </div>
        ) : (
          <>
            <div
              className={`max-h-[60vh] overflow-x-auto overflow-y-auto ${loading ? "opacity-60 transition-opacity" : ""}`}
              aria-busy={loading}
            >
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-background-alt text-xs uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Ref</th>
                    <th className="px-4 py-3 font-semibold">Patient</th>
                    <th className="hidden px-4 py-3 font-semibold md:table-cell">Date</th>
                    <th className="px-4 py-3 font-semibold">Time</th>
                    <th className="hidden px-4 py-3 font-semibold lg:table-cell">Service</th>
                    <th className="hidden px-4 py-3 font-semibold lg:table-cell">Dentist</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {appts.map((a) => (
                    <tr key={a.id} className="transition-colors hover:bg-accent-soft">
                      <td className="px-4 py-3 font-mono text-xs text-text-muted">{a.referenceNumber}</td>
                      <td className="px-4 py-3 font-medium text-text">
                        {a.patient.firstName} {a.patient.lastName}
                      </td>
                      <td className="hidden px-4 py-3 text-text-secondary md:table-cell">{fmtDate(a.appointmentDate)}</td>
                      <td className="px-4 py-3 text-text">{fmtTime(a.startTime)}</td>
                      <td className="hidden px-4 py-3 text-text-secondary lg:table-cell">{a.service.name}</td>
                      <td className="hidden px-4 py-3 text-text-secondary lg:table-cell">{a.dentist.name}</td>
                      <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <StatusActions status={a.status} role={role} onChange={(s) => changeStatus(a.id, s)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination && appts.length > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
                <p className="text-sm text-text-muted">
                  Showing {start}–{end} of {pagination.total}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => goToPage(page - 1)}
                    disabled={page <= 1}
                    aria-label="Previous page"
                    className="rounded-lg border border-border p-1.5 text-text-secondary transition-colors hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {getPageItems(page, pagination.totalPages).map((item, i) =>
                    item === "..." ? (
                      <span key={`ellipsis-${i}`} className="px-1.5 text-sm text-text-muted">…</span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => goToPage(item)}
                        aria-current={item === page ? "page" : undefined}
                        className={`min-w-[2rem] rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
                          item === page
                            ? "bg-accent text-[#0E0F10]"
                            : "text-text-secondary hover:bg-accent-soft hover:text-accent"
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => goToPage(page + 1)}
                    disabled={!pagination || page >= pagination.totalPages}
                    aria-label="Next page"
                    className="rounded-lg border border-border p-1.5 text-text-secondary transition-colors hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  function fmtTime(hhmm: string) {
    const [h, m] = hhmm.split(":").map(Number);
    const p = h >= 12 ? "PM" : "AM";
    const hr = h % 12 === 0 ? 12 : h % 12;
    return `${hr}:${String(m).padStart(2, "0")} ${p}`;
  }
  function fmtDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
}

function StatusActions({ status, role, onChange }: { status: string; role: string; onChange: (s: string) => void }) {
  const next: Record<string, string[]> = {
    PENDING: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["CHECKED_IN", "CANCELLED"],
    CHECKED_IN: ["COMPLETED", "NO_SHOW"],
    COMPLETED: [],
    CANCELLED: [],
    NO_SHOW: [],
  };

  const actions = (next[status] || []).slice(0, role === "DENTIST" ? 1 : 2);

  if (actions.length === 0) return <span className="text-xs text-text-muted">—</span>;

  return (
    <div className="flex justify-end gap-1">
      {actions.map((a) => (
        <button
          key={a}
          onClick={() => onChange(a)}
          className="rounded border border-border bg-surface px-2 py-1 text-xs font-medium text-text-secondary transition-all hover:border-border-accent hover:bg-accent-soft hover:text-accent"
        >
          {a.replace("_", " ")}
        </button>
      ))}
    </div>
  );
}