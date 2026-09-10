"use client";

import { useSyncExternalStore } from "react";
import { Inbox } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

export interface DailyPoint {
  label: string;
  count: number;
}

export interface StatusSlice {
  name: string;
  value: number;
}

interface ChartColors {
  accent: string;
  success: string;
  warning: string;
  error: string;
  neutral: string;
  textMuted: string;
  grid: string;
}

/**
 * Fallback palette (light theme) used for the server render and the first
 * client paint. Once mounted, colours are read from the live CSS variables so
 * the charts always follow the active theme (light or dark).
 */
const FALLBACK_COLORS: ChartColors = {
  accent: "#D4AF37",
  success: "#16a34a",
  warning: "#d97706",
  error: "#dc2626",
  neutral: "#6b7280",
  textMuted: "#9ca3af",
  grid: "#e7e5e4",
};

/** Status → theme variable slot. Kept in sync with StatusBadge semantics. */
const STATUS_COLOR_SLOT: Record<string, keyof ChartColors> = {
  PENDING: "warning",
  CONFIRMED: "accent",
  CHECKED_IN: "accent",
  COMPLETED: "success",
  CANCELLED: "error",
  NO_SHOW: "neutral",
};

function readChartColors(): ChartColors {
  if (typeof window === "undefined") return FALLBACK_COLORS;
  const styles = getComputedStyle(document.documentElement);
  const value = (name: string) => styles.getPropertyValue(name).trim() || undefined;
  return {
    accent: value("--accent") ?? FALLBACK_COLORS.accent,
    success: value("--success") ?? FALLBACK_COLORS.success,
    warning: value("--warning") ?? FALLBACK_COLORS.warning,
    error: value("--error") ?? FALLBACK_COLORS.error,
    neutral: value("--neutral") ?? FALLBACK_COLORS.neutral,
    textMuted: value("--text-muted") ?? FALLBACK_COLORS.textMuted,
    grid: value("--border") ?? FALLBACK_COLORS.grid,
  };
}

// Module-level cache so the snapshot stays referentially stable between renders
// (useSyncExternalStore needs that) and only recomputes when the theme changes.
let cachedTheme: string | null = null;
let cachedColors: ChartColors | null = null;

function getChartColorsSnapshot(): ChartColors {
  if (typeof window === "undefined") return FALLBACK_COLORS;
  const theme = document.documentElement.getAttribute("data-theme");
  if (cachedColors && cachedTheme === theme) return cachedColors;
  cachedColors = readChartColors();
  cachedTheme = theme;
  return cachedColors;
}

function subscribeToTheme(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function useChartColors(): ChartColors {
  return useSyncExternalStore(subscribeToTheme, getChartColorsSnapshot, () => FALLBACK_COLORS);
}

function formatStatusLabel(name: string): string {
  return name
    .toLowerCase()
    .replace("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <Inbox className="mx-auto mb-2 h-8 w-8 text-text-muted" strokeWidth={1.5} />
        <p className="text-sm text-text-muted">{message}</p>
      </div>
    </div>
  );
}

function AreaTooltipContent({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0]?.value ?? 0);
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-text">
        {value} appointment{value === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export function DashboardCharts({ daily, status }: { daily: DailyPoint[]; status: StatusSlice[] }) {
  const colors = useChartColors();
  const totalAppointments = status.reduce((sum, s) => sum + s.value, 0);
  const hasDailyData = daily.some((d) => d.count > 0);
  const hasStatusData = status.some((s) => s.value > 0);

  return (
    <section className="mt-8" aria-label="Analytics">
      <h2 className="text-lg font-semibold text-text">Analytics</h2>
      <div className="mt-3 grid items-stretch gap-6 lg:grid-cols-2">
        {/* Weekly appointments trend */}
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-secondary">Weekly Appointments</h3>
            <span className="text-xs text-text-muted">Last 7 days</span>
          </div>
          <div className="mt-4 h-64">
            {hasDailyData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dailyTrendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.accent} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={colors.accent} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={colors.grid} strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="label"
                    interval="preserveStartEnd"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: colors.textMuted, fontSize: 12 }}
                    dy={6}
                  />
                  <YAxis
                    allowDecimals={false}
                    domain={[0, "auto"]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: colors.textMuted, fontSize: 12 }}
                    width={36}
                  />
                  <Tooltip
                    content={<AreaTooltipContent />}
                    cursor={{ stroke: colors.accent, strokeWidth: 1, strokeDasharray: "4 4" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Appointments"
                    stroke={colors.accent}
                    strokeWidth={2}
                    fill="url(#dailyTrendFill)"
                    dot={{ r: 3, fill: colors.accent, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No appointments in the last 7 days yet." />
            )}
          </div>
        </div>

        {/* Appointment status breakdown */}
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-secondary">Status Breakdown</h3>
            <span className="text-xs text-text-muted">{totalAppointments} total</span>
          </div>
          {hasStatusData ? (
            <>
              <div className="relative mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={status}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="62%"
                      outerRadius="88%"
                      paddingAngle={2}
                      stroke="none"
                    >
                      {status.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={colors[STATUS_COLOR_SLOT[entry.name] ?? "neutral"]}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-text">{totalAppointments}</span>
                  <span className="text-xs text-text-muted">Total</span>
                </div>
              </div>
              <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
                {status.map((entry) => (
                  <li key={entry.name} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colors[STATUS_COLOR_SLOT[entry.name] ?? "neutral"] }}
                    />
                    <span className="flex-1 truncate text-text">{formatStatusLabel(entry.name)}</span>
                    <span className="text-text-muted">{entry.value}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="mt-4 h-64">
              <EmptyState message="No appointment statuses recorded yet." />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}