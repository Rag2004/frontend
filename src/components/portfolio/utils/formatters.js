import { getStrategyDisplayName } from '../../../lib/strategyDisplayNames';

export function fmtINR(v) {
  if (v == null || Number.isNaN(v)) return '—';
  // Keep sign + ₹ + digits as one unbreakable token (avoids "-" wrapping alone in narrow cells).
  const abs = Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return v < 0 ? `\u2212\u20B9${abs}` : `\u20B9${abs}`;
}

export function fmtPct(v, d = 2) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(Number(v) * (Math.abs(v) <= 1 ? 100 : 1)).toFixed(d)}%`;
}

export function cleanStrategyName(id) {
  return getStrategyDisplayName(id);
}

/** Compact ISO date for table cells: 2025-12-05 → 05 Dec'25 */
export function fmtCsvDay(iso) {
  if (!iso || typeof iso !== 'string' || iso.length < 10) return null;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (!y || !m || !d) return null;
  const mon = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-GB', {
    month: 'short',
    timeZone: 'UTC',
  });
  return `${String(d).padStart(2, '0')} ${mon}'${String(y).slice(-2)}`;
}

export function fmtDeltaPct(current, baseline) {
  if (current == null || baseline == null || !baseline) return null;
  const pct = ((Number(current) - Number(baseline)) / Math.abs(Number(baseline))) * 100;
  if (!Number.isFinite(pct)) return null;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}
