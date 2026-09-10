"use client";

import {
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type CellData,
  type ColumnDef,
  type RowData,
  type TableFeatures,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

export type DataTableFeatures = typeof dataTableFeatures;

export interface DataTableProps<TData extends RowData, TValue extends CellData = CellData> {
  columns: ColumnDef<DataTableFeatures, TData, TValue>[];
  data: TData[];
  getRowId?: (row: TData, index: number) => string;
  onRowClick?: (row: TData) => void;
}

export function DataTable<TData extends RowData, TValue extends CellData = CellData>({
  columns,
  data,
  getRowId,
  onRowClick,
}: DataTableProps<TData, TValue>) {
  const table = useTable({
    features: dataTableFeatures,
    // v9 types row-model inputs as ColumnDef<F, TData, unknown>; the wrapper
    // keeps a shadcn-style generic instead, so escape through unknown here.
    columns: columns as unknown as ColumnDef<DataTableFeatures, TData, unknown>[],
    data,
    getRowId: getRowId ? (row, index) => getRowId(row, index) : undefined,
  });

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
                      canSort && "cursor-pointer select-none"
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
              <TableCell
                colSpan={columns.length}
                className="h-24 px-4 py-3 text-center text-text-muted"
              >
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}