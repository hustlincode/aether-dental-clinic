"use client";

import {
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  columnFilteringFeature,
  filterFn_equalsString,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type CellData,
  type ColumnDef,
  type RowData,
  type TableFeatures,
  type TableOptions,
  type ReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Search,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

declare module "@tanstack/table-core" {
  // The type parameters must shadow the library's original generic declaration
  // even though the augmentation itself adds no generic-dependent members.
  /* eslint-disable @typescript-eslint/no-unused-vars */
  interface ColumnMeta<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData,
    TValue extends CellData,
  > {
    /** Extra classes applied to every cell rendered for this column. */
    cellClassName?: string;
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}

/**
 * TanStack Table v9 feature set used by every table built on this wrapper:
 * the core row model (automatic in v9) plus client-side row sorting.
 * Module scope keeps the reference stable across renders.
 */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

/**
 * Full client-side feature set: sorting + global search + column filters +
 * pagination. Used by tables that own their whole dataset (services, patients,
 * follow-ups) so search/filter/sort/page all happen locally in the browser.
 * Individual built-ins only (no stockFeatures) to keep tree-shaking.
 */
export const filterableDataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: {
    includesString: filterFn_includesString,
    equalsString: filterFn_equalsString,
  },
});

export type DataTableFeatures = typeof dataTableFeatures;
export type FilterableDataTableFeatures = typeof filterableDataTableFeatures;

/** Stable module-scope fallback so model renders never see a fresh array. */
const EMPTY_DATA: never[] = [];

export interface UseDataTableOptions<
  TData extends RowData,
  TValue extends CellData = CellData,
> {
  columns: ColumnDef<FilterableDataTableFeatures, TData, TValue>[];
  data: TData[];
  getRowId?: (row: TData, index: number) => string;
  /**
   * Extra TanStack options (initialState, globalFilterFn,
   * getColumnCanGlobalFilter, autoResetPageIndex, ...). "features", "columns"
   * and "data" are managed by the hook and rejected here.
   */
  options?: Partial<
    Omit<TableOptions<FilterableDataTableFeatures, TData>, "features" | "columns" | "data">
  >;
}

/**
 * Builds a TanStack v9 table instance with the full client-side feature set.
 * Use the returned instance with <DataTable table={...} /> plus
 * <DataTableToolbar> / <DataTablePagination>.
 */
export function useDataTable<TData extends RowData, TValue extends CellData = CellData>({
  columns,
  data,
  getRowId,
  options,
}: UseDataTableOptions<TData, TValue>): ReactTable<FilterableDataTableFeatures, TData> {
  return useTable({
    features: filterableDataTableFeatures,
    // v9 types row-model inputs as ColumnDef<F, TData, unknown>; the wrapper
    // keeps a shadcn-style generic instead, so escape through unknown here.
    columns: columns as unknown as ColumnDef<FilterableDataTableFeatures, TData, unknown>[],
    data,
    getRowId: getRowId
      ? (row, index) => getRowId(row, index)
      : (row) => (row as { id?: string }).id ?? String(row),
    globalFilterFn: "includesString",
    // Never let the global search run over action/renderer-only columns.
    getColumnCanGlobalFilter: (column) => {
      const forbidden = new Set(["actions", "action", "lastAppointment"]);
      return !forbidden.has(column.id);
    },
    ...options,
  });
}

/**
 * Shared table renderer. Accepts a ReactTable from `useDataTable` (full
 * feature set) or the internally-built sorting-only table, so one body
 * implementation serves both paths.
 */
function DataTableBody<TData extends RowData>({
  table,
  onRowClick,
}: {
  table: ReactTable<TableFeatures, TData>;
  onRowClick?: (row: TData) => void;
}) {
  // Column count for the empty-state colSpan. getVisibleLeafColumns() belongs
  // to the (unregistered) column-visibility feature, so count header cells in
  // the first header group instead (core headers feature, no grouping here).
  const columnsCount = table.getHeaderGroups()[0]?.headers.length ?? 0;

  return (
    // The shadcn <Table> component wraps itself in an overflow-x-auto container.
    // That container would become the nearest scrollport and break the sticky
    // header, so neutralize it and let the actual scroll container (set by the
    // consumer, as in appointments-list) take over.
    <div className="[&>div]:overflow-visible">
      <Table className="w-full text-left text-sm">
        <TableHeader className="[&_tr]:border-0 sticky top-0 z-10 border-b border-border bg-background-alt text-xs uppercase tracking-wide text-text-muted">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sortDir = header.column.getIsSorted();
                const toggleSort = canSort ? header.column.getToggleSortingHandler() : undefined;

                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "h-auto px-4 py-3 font-semibold text-text-muted",
                      canSort && "cursor-pointer select-none",
                      // Critical for responsive tables: the same cell classes
                      // that hide body cells on small screens must hide the
                      // header cell too, otherwise the remaining body cells
                      // shift left and land under the WRONG column headers.
                      header.column.columnDef.meta?.cellClassName
                    )}
                    aria-sort={
                      sortDir === "asc" ? "ascending" : sortDir === "desc" ? "descending" : undefined
                    }
                  >
                    {header.isPlaceholder ? null : toggleSort ? (
                      <button
                        type="button"
                        onClick={toggleSort}
                        className="inline-flex h-full w-full items-center gap-1.5 text-left"
                      >
                        <table.FlexRender header={header} />
                        {sortDir === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5 shrink-0 text-accent" />
                        ) : sortDir === "desc" ? (
                          <ArrowDown className="h-3.5 w-3.5 shrink-0 text-accent" />
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-text-muted opacity-60" />
                        )}
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn(
                  "border-border hover:bg-accent-soft",
                  onRowClick && "cursor-pointer"
                )}
              >
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn("px-4 py-3", cell.column.columnDef.meta?.cellClassName)}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="border-border">
              <TableCell colSpan={columnsCount} className="h-24 px-4 py-3 text-center text-text-muted">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export interface DataTableProps<TData extends RowData, TValue extends CellData = CellData> {
  /** Optional table instance created by useDataTable (full feature set). */
  table?: ReactTable<FilterableDataTableFeatures, TData>;
  /** Self-contained mode (sorting only): columns for the internally-built table. */
  columns?: ColumnDef<DataTableFeatures, TData, TValue>[];
  /** Self-contained mode: rows to render. */
  data?: TData[];
  getRowId?: (row: TData, index: number) => string;
  onRowClick?: (row: TData) => void;
}

/**
 * TanStack-backed table renderer.
 *
 * Two modes:
 * 1. Controlled: pass a `table` from useDataTable (full search/filter/sort/
 *    pagination feature set) — rendered together with DataTableToolbar and
 *    DataTablePagination.
 * 2. Self-contained: pass `columns` + `data`; the table builds itself with
 *    client-side sorting only (used by appointments-list, which keeps its
 *    server-driven search/pagination).
 */
export function DataTable<TData extends RowData, TValue extends CellData = CellData>(
  props: DataTableProps<TData, TValue>
) {
  // Always build the sorting-only fallback (unconditional hook call). When a
  // `table` was passed from useDataTable it simply isn't used; component
  // identity stays stable so table state is never dropped by remounting.
  const fallbackTable = useTable({
    features: dataTableFeatures,
    columns: (props.columns ?? EMPTY_DATA) as unknown as ColumnDef<
      DataTableFeatures,
      TData,
      unknown
    >[],
    data: (props.data ?? EMPTY_DATA) as TData[],
    getRowId: props.getRowId
      ? (row, index) => props.getRowId!(row, index)
      : (row) => (row as { id?: string }).id ?? String(row),
  });

  const active = (props.table ?? fallbackTable) as unknown as ReactTable<TableFeatures, TData>;

  return <DataTableBody table={active} onRowClick={props.onRowClick} />;
}

export interface DataTableFilterOption {
  value: string;
  label: string;
}

export interface DataTableFilterConfig {
  /** Column id the filter dropdown controls (column must use 'equalsString'). */
  columnId: string;
  /** Dropdown label, e.g. "Status". */
  label: string;
  /** "All X" option label; defaults to `All ${label}`. */
  allLabel?: string;
  options: DataTableFilterOption[];
}

const toolbarInputClass =
  "h-9 rounded-lg border border-border bg-background-alt text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40";

/**
 * Search box (global filter) + optional column-filter dropdowns on top of a
 * table built with useDataTable. Filtering is instant and client-side.
 */
export function DataTableToolbar<TData extends RowData>({
  table,
  searchPlaceholder = "Search...",
  filters = [],
  className,
}: {
  table: ReactTable<FilterableDataTableFeatures, TData>;
  searchPlaceholder?: string;
  filters?: DataTableFilterConfig[];
  className?: string;
}) {
  // Controlled by the table's own globalFilter state — typing pushes straight
  // into TanStack, and any external reset/refresh flows back through the store.
  const globalFilter = (table.state.globalFilter ?? "") as string;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          value={globalFilter}
          onChange={(e) => {
            const next = e.target.value;
            table.setGlobalFilter(next === "" ? undefined : next);
          }}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className={cn(toolbarInputClass, "w-full max-w-xs pl-8 pr-3")}
        />
      </div>
      {filters.map((filter) => {
        const column = table.getColumn(filter.columnId);
        const current = (column?.getFilterValue() as string) ?? "";
        return (
          <Select
            key={filter.columnId}
            value={current || "__all__"}
            onValueChange={(v) => column?.setFilterValue(v === "__all__" ? undefined : v)}
          >
            <SelectTrigger
              aria-label={filter.label}
              className="h-9 rounded-lg border-border bg-background-alt px-3 text-sm text-text focus-visible:ring-accent/40"
            >
              <SelectValue placeholder={filter.allLabel ?? `All ${filter.label}`} />
            </SelectTrigger>
            <SelectContent className="bg-surface">
              <SelectItem value="__all__">{filter.allLabel ?? `All ${filter.label}`}</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}
    </div>
  );
}

/** Compact numbered pagination controls for a useDataTable-built table. */
export function DataTablePagination<TData extends RowData>({
  table,
  className,
}: {
  table: ReactTable<FilterableDataTableFeatures, TData>;
  className?: string;
}) {
  const { pageIndex, pageSize } = table.state.pagination;
  const rowCount = table.getRowCount();
  const pageCount = table.getPageCount();

  if (rowCount === 0) return null;

  const from = pageIndex * pageSize + 1;
  const to = Math.min(rowCount, (pageIndex + 1) * pageSize);

  return (
    <div className={cn("flex items-center justify-between gap-3 px-1", className)}>
      <p className="text-xs text-text-muted">
        Showing <span className="font-medium text-text">{from}</span>–
        <span className="font-medium text-text">{to}</span> of{" "}
        <span className="font-medium text-text">{rowCount}</span>
      </p>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-secondary hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Previous page</TooltipContent>
        </Tooltip>
        {pageItems(pageIndex + 1, pageCount).map((item, i) =>
          item === "..." ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-text-muted">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => table.setPageIndex(item - 1)}
              aria-current={item === pageIndex + 1 ? "page" : undefined}
              className={
                item === pageIndex + 1
                  ? "inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-xs font-semibold text-primary-foreground"
                  : "inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs text-text-secondary hover:bg-accent-soft hover:text-accent"
              }
            >
              {item}
            </button>
          )
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-secondary hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Next page</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function pageItems(current: number, totalPages: number): (number | "...")[] {
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