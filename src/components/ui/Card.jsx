import { cn } from '../../lib/utils';

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'w-full rounded-desk-lg border border-desk-border bg-desk-card p-6 shadow-desk',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div className={cn('mb-2', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h2 className={cn('text-lg font-semibold tracking-tight text-desk-text', className)} {...props}>
      {children}
    </h2>
  );
}
