import { cn } from '../../lib/utils';

export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        'h-9 rounded-desk-md border border-desk-border bg-black/30 px-2 text-sm text-desk-text focus:border-desk-accent focus:outline-none',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
