import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const variants = cva(
  'inline-flex items-center rounded-desk-sm border px-2 py-0.5 font-mono text-[0.65rem] font-semibold uppercase tracking-wide',
  {
    variants: {
      variant: {
        default: 'border-desk-border bg-white/5 text-desk-muted',
        success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
        warning: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
        danger: 'border-red-500/40 bg-red-500/10 text-red-200',
        accent: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export function Badge({ className, variant, ...props }) {
  return <span className={cn(variants({ variant }), className)} {...props} />;
}
