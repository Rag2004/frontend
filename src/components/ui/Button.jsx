import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const variants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-desk-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-desk-accent focus-visible:ring-offset-2 focus-visible:ring-offset-desk-main disabled:pointer-events-none disabled:opacity-50 font-sans text-sm',
  {
    variants: {
      variant: {
        default: 'bg-desk-panel text-desk-text hover:bg-slate-600 border border-desk-border',
        primary: 'bg-desk-accent text-desk-main hover:opacity-90 border border-transparent font-semibold',
        ghost: 'bg-transparent text-desk-muted hover:text-desk-text hover:bg-white/5',
        danger: 'bg-red-900/40 text-red-200 border border-red-700/50 hover:bg-red-900/60',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs rounded-desk-sm',
        xs: 'h-7 px-2 text-xs',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export function Button({ className, variant, size, type = 'button', ...props }) {
  return <button type={type} className={cn(variants({ variant, size }), className)} {...props} />;
}
