import { cn } from '../../lib/utils';

export function Spinner({ className, size = 'md' }) {
  const s = size === 'sm' ? 'h-4 w-4 border' : 'h-8 w-8 border-2';
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block animate-spin rounded-full border-desk-accent border-t-transparent',
        s,
        className
      )}
    />
  );
}
