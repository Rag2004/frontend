import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table';
import { TableShell, DataTable } from './ui/TableShell';
import { EmptyState } from './EmptyState';

/**
 * Sortable data-dense table with sticky header.
 */
export function DeskTable({
  data,
  columns,
  getRowId,
  emptyTitle = 'No data',
  emptyHint,
  className,
  onRowClick,
  getRowClassName,
  /** Optional <tr>…</tr> rendered in <tfoot> (same table = column alignment with body). */
  footer,
  /** @type {{ id: string, desc?: boolean }[]} */
  initialSorting = [],
  density = 'default',
  tableClassName = '',
}) {
  const [sorting, setSorting] = useState(initialSorting);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
  });

  const rows = table.getRowModel().rows;

  const rowPad = density === 'comfortable' ? 'py-2.5' : 'py-2';
  const cellText = 'text-sm';

  if (!data?.length) {
    return (
      <TableShell className={className}>
        <EmptyState title={emptyTitle} hint={emptyHint} />
      </TableShell>
    );
  }

  return (
    <TableShell className={className}>
      <DataTable className={tableClassName}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const canSort = h.column.getCanSort();
                const thClass = h.column.columnDef.meta?.numeric
                  ? `sticky top-0 z-10 select-none border-b border-desk-border bg-[#0f172a] px-3 py-2 text-right font-mono text-xs font-semibold uppercase tracking-wider text-gray-300 ${canSort ? 'cursor-pointer hover:text-gray-100' : 'cursor-default'}`
                  : `sticky top-0 z-10 select-none border-b border-desk-border bg-[#0f172a] px-3 py-2 text-left font-mono text-xs font-semibold uppercase tracking-wider text-gray-300 ${canSort ? 'cursor-pointer hover:text-gray-100' : 'cursor-default'}`;
                return (
                  <th
                    key={h.id}
                    colSpan={h.colSpan}
                    className={thClass}
                    onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {canSort
                      ? {
                          asc: ' ↑',
                          desc: ' ↓',
                        }[h.column.getIsSorted()] ?? null
                      : null}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={row.id}
              className={`h-10 ${idx % 2 === 1 ? 'bg-white/[0.02]' : ''} ${onRowClick ? 'cursor-pointer transition-colors duration-150 hover:bg-white/5' : ''} ${getRowClassName?.(row.original) ?? ''}`}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              role={onRowClick ? 'button' : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={
                    cell.column.columnDef.meta?.numeric
                      ? `border-b border-desk-border px-3 ${rowPad} text-right font-mono tabular-nums text-desk-text ${cellText}`
                      : `border-b border-desk-border px-3 ${rowPad} font-sans ${cellText} text-desk-text`
                  }
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? <tfoot>{footer}</tfoot> : null}
      </DataTable>
    </TableShell>
  );
}
