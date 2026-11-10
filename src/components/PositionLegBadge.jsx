import { Badge } from './ui/Badge';
import { classifyPositionLeg } from '../lib/positionLeg';

/** Hedge vs primary (short) leg — uses `leg_role` from API when present. */
export function PositionLegBadge({ position }) {
  const { label, variant, title, inferred } = classifyPositionLeg(position);
  return (
    <span className="inline-flex items-center gap-1.5" title={title || undefined}>
      <Badge variant={variant}>{label}</Badge>
      {inferred ? (
        <span className="font-mono text-[0.58rem] text-desk-muted" aria-hidden>
          *
        </span>
      ) : null}
    </span>
  );
}
