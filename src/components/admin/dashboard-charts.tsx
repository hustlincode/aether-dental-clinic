"use client";

import { useSyncExternalStore, useState } from "react";
import { Inbox } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
  type PieSectorShapeProps,
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

interface ChartPalette {
  /** Five series slots, in `--chart-1 … --chart-5` order. */
  series: string[];
  /** Axis tick / label ink — a text token, so it owes 4.5:1, not 3:1. */
  axis: string;
  /** Gridlines. Decorative, therefore exempt from WCAG 1.4.11. */
  grid: string;
}

/** Status → series slot. One pair shares a slot by necessity: six statuses,
 *  five slots. CONFIRMED + CHECKED_IN are the "active" pair and share a slot
 *  exactly as they shared the gold accent before P4. Every other status maps
 *  to the hue it already wore, and the hues differ by lightness as well as
 *  hue in both themes. See `--chart-*` in globals.css. */
const STATUS_COLOR_SLOT: Record<string, number> = {
  PENDING: 0, // chart-1 — amber/gold: attention
  CONFIRMED: 1, // chart-2 — blue
  CHECKED_IN: 1, // chart-2 — shares with CONFIRMED (semantically adjacent)
  COMPLETED: 2, // chart-3 — green
  CANCELLED: 3, // chart-4 — red
  NO_SHOW: 4, // chart-5 — grey
};
const DEFAULT_SLOT = 4;

/**
 * Reads the live chart tokens off `:root`. Returns `null` until they resolve.
 *
 * There is deliberately NO fallback palette here. A hardcoded fallback is a
 * second copy of the palette that can never be kept in sync with
 * `--chart-*` and is exactly what makes the first client paint disagree with
 * the active theme. Instead the server snapshot is `null` and nothing is
 * painted until the real values are read — one frame of an empty chart card is
 * strictly better than one frame of wrong-coloured geometry.
 */
function readChartPalette(): ChartPalette | null {
  if (typeof window === "undefined") return null;
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string) => styles.getPropertyValue(name).trim();
  const series = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"].map(read);
  const axis = read("--chart-axis");
  const grid = read("--chart-grid");
  if (series.some((color) => color === "") || axis === "" || grid === "") return null;
  return { series, axis, grid };
}

// Module-level cache so the snapshot stays referentially stable between renders
// (useSyncExternalStore needs that) and only recomputes when the theme changes.
let cachedTheme: string | null = null;
let cachedPalette: ChartPalette | null = null;

function getChartPaletteSnapshot(): ChartPalette | null {
  if (typeof window === "undefined") return null;
  const theme = document.documentElement.getAttribute("data-theme");
  if (cachedPalette && cachedTheme === theme) return cachedPalette;
  cachedPalette = readChartPalette();
  cachedTheme = theme;
  return cachedPalette;
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

function useChartPalette(): ChartPalette | null {
  return useSyncExternalStore(subscribeToTheme, getChartPaletteSnapshot, () => null);
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
    <div className="rounded-control border border-border bg-chart-surface px-3 py-2 shadow-xl">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-text">
        {value} appointment{value === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function StatusTooltipContent({
  active,
  payload,
  total,
}: Partial<TooltipContentProps<number, string>> & { total: number }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]?.payload as StatusSlice | undefined;
  if (!entry || entry.value <= 0) return null;
  const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
  return (
    <div className="rounded-control border border-border bg-chart-surface px-3 py-2 shadow-xl">
      <p className="text-xs font-medium text-text-muted">{formatStatusLabel(entry.name)}</p>
      <p className="mt-0.5 text-sm font-semibold text-text">
        {entry.value} · {pct}%
      </p>
    </div>
  );
}

export function DashboardCharts({ daily, status }: { daily: DailyPoint[]; status: StatusSlice[] }) {
  const palette = useChartPalette();
  const [activeIndex, setActiveIndex] = useState(-1);
  const totalAppointments = status.reduce((sum, s) => sum + s.value, 0);
  const hasDailyData = daily.some((d) => d.count > 0);
  const hasStatusData = status.some((s) => s.value > 0);
  const slotColor = (name: string) => palette?.series[STATUS_COLOR_SLOT[name] ?? DEFAULT_SLOT];
  const chartReady = palette !== null;

  /* Custom sector shape → per-slice hover: enlarges the hovered slice and
     dims the others. Driven by our own activeIndex so the legend can sync too
     (Recharts v3 removed the activeIndex prop and only exposes tooltip internals). */
  const renderPieShape = (props: PieSectorShapeProps) => {
    const { cx = 0, cy = 0, innerRadius = 0, outerRadius = 0, startAngle = 0, endAngle = 0, fill, index } = props;
    const isActive = index === activeIndex;
    const dimmed = activeIndex !== -1 && !isActive;
    const or = typeof outerRadius === "number" ? outerRadius + (isActive ? 6 : 0) : outerRadius;
    return (
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={or}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        cornerRadius={3}
        opacity={dimmed ? 0.45 : 1}
        onMouseEnter={() => setActiveIndex(index)}
        onMouseLeave={() => setActiveIndex(-1)}
        style={{ cursor: "pointer", transition: "opacity 200ms ease", outline: "none" }}
      />
    );
  };

  return (
    <section aria-label="Analytics">
      <h2 className="text-lg font-semibold text-text">Analytics</h2>
      <div className="mt-3 grid items-stretch gap-6 lg:grid-cols-2">
        {/* Weekly appointments trend */}
        <div className="card-surface p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-secondary">Weekly Appointments</h3>
            <span className="text-xs text-text-muted">Last 7 days</span>
          </div>
          <div className="mt-4 h-64">
            {/* Nothing renders until the palette resolves. The fixed height is
                kept so the card does not shift when it arrives. */}
            {chartReady && hasDailyData && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dailyTrendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={palette.series[0]} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={palette.series[0]} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={palette.grid} strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="label"
                    interval="preserveStartEnd"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: palette.axis, fontSize: 12 }}
                    dy={6}
                  />
                  <YAxis
                    allowDecimals={false}
                    domain={[0, "auto"]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: palette.axis, fontSize: 12 }}
                    width={36}
                  />
                  <Tooltip
                    content={<AreaTooltipContent />}
                    cursor={{ stroke: palette.series[0], strokeWidth: 1, strokeDasharray: "4 4" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Appointments"
                    stroke={palette.series[0]}
                    strokeWidth={2}
                    fill="url(#dailyTrendFill)"
                    dot={{ r: 3, fill: palette.series[0], strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
            {chartReady && !hasDailyData && (
              <EmptyState message="No appointments in the last 7 days yet." />
            )}
          </div>
        </div>

        {/* Appointment status breakdown */}
        <div className="card-surface p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-secondary">Status Breakdown</h3>
            <span className="text-xs text-text-muted">{totalAppointments} total</span>
          </div>
          {palette && hasStatusData ? (
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
                      cornerRadius={3}
                      stroke="none"
                      shape={renderPieShape}
                    >
                      {status.map((entry) => (
                        <Cell key={entry.name} fill={slotColor(entry.name)} />
                      ))}
                    </Pie>
                    <Tooltip content={<StatusTooltipContent total={totalAppointments} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-text">{totalAppointments}</span>
                  <span className="text-xs text-text-muted">Total</span>
                </div>
              </div>
              <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1">
                {status.map((entry, i) => (
                  <li key={entry.name}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(i)}
                      onMouseLeave={() => setActiveIndex(-1)}
                      onFocus={() => setActiveIndex(i)}
                      onBlur={() => setActiveIndex(-1)}
                      className={`flex min-h-8 w-full items-center gap-2 rounded-chip px-1.5 py-1.5 text-left text-sm transition-colors ${
                        activeIndex === i ? "bg-accent-soft" : "hover:bg-background-alt"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-pill"
                        style={{ backgroundColor: slotColor(entry.name) }}
                      />
                      <span className="flex-1 truncate text-text">{formatStatusLabel(entry.name)}</span>
                      <span className="text-text-muted">{entry.value}</span>
                    </button>
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