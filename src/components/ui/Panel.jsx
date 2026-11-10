import { cn } from '../../lib/utils';

export function Panel({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-desk-lg border border-desk-border bg-desk-card shadow-desk',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PanelHeader({ icon, title, className, children, ...props }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between border-b border-desk-border bg-desk-panel px-3 py-2',
        className
      )}
      {...props}
    >
      <span className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-desk-accent">
        {icon ? `${icon} ` : ''}
        {title}
      </span>
      {children}
    </div>
  );
}

export function PanelBody({ className, children, ...props }) {
  return (
    <div className={cn('p-3', className)} {...props}>
      {children}
    </div>
  );
}
