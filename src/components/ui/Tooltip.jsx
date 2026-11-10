import * as Tooltip from '@radix-ui/react-tooltip';
import { cn } from '../../lib/utils';

/** Accessible tooltip (Radix). Wrap app with TooltipProvider in main.jsx. */
export function DeskTooltip({ children, label, side = 'top' }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={4}
          className={cn(
            'z-[100] max-w-xs rounded-desk-md border border-desk-border bg-desk-card px-2 py-1.5 font-mono text-[0.7rem] text-desk-text shadow-desk'
          )}
        >
          {label}
          <Tooltip.Arrow className="fill-desk-border" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

