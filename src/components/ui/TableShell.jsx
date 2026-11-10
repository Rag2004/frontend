import { cn } from '../../lib/utils';

/** Scroll container + sticky header wrapper for data-dense tables */
export function TableShell({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-desk-md border border-desk-border',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function DataTable({ className, children, ...props }) {
  return (
    <table
      className={cn('w-full border-collapse text-sm', className)}
      {...props}
    >
      {children}
    </table>
  );
}

export function ThNum({ className, children, ...props }) {
  return (
    <th
      className={cn(
        'sticky top-0 z-[1] bg-slate-900/95 px-3 py-2 text-right font-mono text-[0.62rem] font-semibold uppercase tracking-wide text-desk-muted backdrop-blur-sm',
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function ThText({ className, children, ...props }) {
  return (
    <th
      className={cn(
        'sticky top-0 z-[1] bg-slate-900/95 px-3 py-2 text-left font-mono text-[0.62rem] font-semibold uppercase tracking-wide text-desk-muted backdrop-blur-sm',
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TdNum({ className, children, ...props }) {
  return (
    <td
      className={cn(
        'border-b border-desk-border px-3 py-2 text-right font-mono tabular-nums text-desk-text',
        className
      )}
      {...props}
    >
      {children}
    </td>
  );
}

export function TdText({ className, children, ...props }) {
  return (
    <td
      className={cn(
        'border-b border-desk-border px-3 py-2 font-mono text-[0.8rem] text-desk-text',
        className
      )}
      {...props}
    >
      {children}
    </td>
  );
}
