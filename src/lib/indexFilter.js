export const NIFTY_SCRIP = 13;
export const SENSEX_SCRIP = 15;

export const INDEX_FILTERS = {
  ALL: 'all',
  NIFTY: 'nifty',
  SENSEX: 'sensex',
};

function inferUnderlyingFromStrategyId(strategyId) {
  const sid = String(strategyId || '').toUpperCase();
  if (sid.startsWith('NF_')) return NIFTY_SCRIP;
  if (sid.startsWith('SN_')) return SENSEX_SCRIP;
  return null;
}

export function buildStrategyUnderlyingMap(configs) {
  const out = {};
  for (const cfg of configs || []) {
    const sid = cfg?.strategy_id;
    if (!sid) continue;
    const us = Number(cfg?.underlying_scrip);
    if (Number.isFinite(us) && us > 0) out[sid] = us;
  }
  return out;
}

/** Resolved scrip id from config or NF_/SN_ prefix; null if unknown. */
function resolveUnderlyingScrip(strategyId, strategyUnderlyingById) {
  const explicit = Number(strategyUnderlyingById?.[strategyId]);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return inferUnderlyingFromStrategyId(strategyId);
}

/**
 * Index filter to use when showing MTM/Payoff for a single strategy drill-down.
 * Locks to NIFTY or SENSEX when the strategy maps to those underlyings; else ALL.
 */
export function indexFilterForStrategy(strategyId, strategyUnderlyingById) {
  if (!strategyId) return INDEX_FILTERS.ALL;
  const resolved = resolveUnderlyingScrip(strategyId, strategyUnderlyingById);
  if (resolved === NIFTY_SCRIP) return INDEX_FILTERS.NIFTY;
  if (resolved === SENSEX_SCRIP) return INDEX_FILTERS.SENSEX;
  return INDEX_FILTERS.ALL;
}

/** Short label for read-only index display in chart headers. */
export function indexFilterDisplayName(filter) {
  if (filter === INDEX_FILTERS.NIFTY) return 'NIFTY';
  if (filter === INDEX_FILTERS.SENSEX) return 'SENSEX';
  return 'All';
}

export function strategyMatchesIndex(strategyId, filter, strategyUnderlyingById) {
  const f = filter || INDEX_FILTERS.ALL;
  if (f === INDEX_FILTERS.ALL) return true;
  const resolved = resolveUnderlyingScrip(strategyId, strategyUnderlyingById);
  if (f === INDEX_FILTERS.NIFTY) return resolved === NIFTY_SCRIP;
  if (f === INDEX_FILTERS.SENSEX) return resolved === SENSEX_SCRIP;
  return true;
}
