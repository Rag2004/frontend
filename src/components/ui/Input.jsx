import { cn } from '../../lib/utils';

export function Input({ className, type = 'text', ...props }) {
  return (
    <input
      type={type}
      className={cn(
        'h-9 w-full rounded-desk-md border border-desk-border bg-black/30 px-2.5 text-sm text-desk-text placeholder:text-desk-muted focus:border-desk-accent focus:outline-none',
        className
      )}
      {...props}
    />
  );
}
