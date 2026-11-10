export function sharpeRiskClass(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return 'pf-risk--warn';
  if (n >= 3) return 'pf-risk--good';
  if (n >= 1) return 'pf-risk--warn';
  return 'pf-risk--bad';
}

export function drawdownRiskClass(v) {
  const n = Math.abs(Number(v) || 0);
  if (n === 0) return 'pf-risk--good';
  if (n < 2500) return 'pf-risk--warn';
  return 'pf-risk--bad';
}

export function recommendationFromRow(row) {
  if ((row?.data_source || 'none') === 'none') {
    return { label: 'No data', variant: 'default' };
  }
  const delta = Number(row?.delta_lots) || 0;
  const rec = Number(row?.recommended_lots) || 0;
  if (rec === 0 && delta < 0) return { label: 'Remove', variant: 'danger' };
  if (delta > 0) return { label: 'Increase', variant: 'success' };
  if (delta < 0) return { label: 'Reduce', variant: 'warning' };
  return { label: 'Maintain', variant: 'default' };
}

export function statusFromRow(row, isPaper = false) {
  if (isPaper) return { label: 'PAPER', variant: 'accent' };
  const src = row?.data_source || 'none';
  if (src === 'none') return { label: 'MISSING', variant: 'default' };
  if (src === 'live') return { label: 'LIVE', variant: 'warning' };
  if (src === 'csv') return { label: 'CSV', variant: 'success' };
  if (src === 'hybrid') return { label: 'HYBRID', variant: 'accent' };
  return { label: 'INACTIVE', variant: 'default' };
}

export function healthBadgeVariant(label) {
  const l = (label || '').toLowerCase();
  if (['excellent', 'low', 'good'].includes(l)) return 'success';
  if (['medium', 'weak'].includes(l)) return 'warning';
  return 'danger';
}
