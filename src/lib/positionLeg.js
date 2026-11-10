/**
 * Classify open positions into hedge vs primary (short) legs using backend `leg_role`
 * when present (`hedge` | `primary` from strategy metadata), else infer from side.
 */
export function classifyPositionLeg(p) {
  const leg = String(p.leg_role || '').toLowerCase();
  if (leg === 'hedge') {
    return {
      kind: 'hedge',
      label: 'Hedge',
      variant: 'accent',
      inferred: false,
      title: p.leg_group_id ? `Group: ${p.leg_group_id}` : 'Static hedge (long)',
    };
  }
  if (leg === 'primary') {
    return {
      kind: 'primary',
      label: 'Primary',
      variant: 'warning',
      inferred: false,
      title: 'Main short leg',
    };
  }
  if (p.side === 'BUY') {
    return {
      kind: 'hedge',
      label: 'Long',
      variant: 'accent',
      inferred: true,
      title: 'Inferred from side — open long (not marked leg_role in DB)',
    };
  }
  if (p.side === 'SELL') {
    return {
      kind: 'primary',
      label: 'Short',
      variant: 'warning',
      inferred: true,
      title: 'Inferred from side — open short (not marked leg_role in DB)',
    };
  }
  return { kind: 'unknown', label: '—', variant: 'default', inferred: false, title: '' };
}

/** Tailwind classes for DeskTable row striping by leg kind */
export function positionLegRowClass(p) {
  const { kind } = classifyPositionLeg(p);
  if (kind === 'hedge') return 'border-l-[3px] border-l-violet-500/55 bg-violet-950/[0.18]';
  if (kind === 'primary') return 'border-l-[3px] border-l-amber-500/45 bg-amber-950/[0.12]';
  return '';
}
