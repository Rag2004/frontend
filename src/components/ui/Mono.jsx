import { cn } from '../../lib/utils';

export function Mono({ children, className, tone, style, color, size }) {
  const toneCls =
    tone === 'positive'
      ? 'text-emerald-400'
      : tone === 'negative'
        ? 'text-red-400'
        : tone === 'muted'
          ? 'text-desk-muted'
          : !color
            ? 'text-desk-text'
            : '';
  const mergedStyle = { fontVariantNumeric: 'tabular-nums', ...style };
  if (color) mergedStyle.color = color;
  if (size) mergedStyle.fontSize = size;
  return (
    <span className={cn('font-mono', toneCls, className)} style={mergedStyle}>
      {children}
    </span>
  );
}

export function StatusDot({ active, blink = true }) {
  return (
    <span
      className={cn(
        'inline-block h-1.5 w-1.5 rounded-full',
        active ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-red-400 shadow-[0_0_6px_#f87171]',
        active && blink && 'animate-pulse'
      )}
      aria-hidden
    />
  );
}
