import { cn } from '../../lib/utils';

export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn('animate-pulse rounded-desk-md bg-desk-panel/80', className)}
      {...props}
    />
  );
}
