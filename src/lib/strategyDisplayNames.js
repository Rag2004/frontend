/** Dashboard display aliases — backend strategy IDs unchanged for API calls. */
const DISPLAY_ALIASES = {
  NF_S0_10: 'GL_2',
  NF_S59_V1: 'NF_S39',
  NF_S58_V7: 'NF_S38',
  NF_S310_V1: 'NF_S33',
  MANUAL_TEST: 'Manual Test',
};

function stripVersionSuffix(id) {
  return (id || '').replace(/_V\d.*$/i, '');
}

/** Resolved display name: alias if mapped, else version-stripped ID. */
export function getStrategyDisplayName(strategyId) {
  const sid = String(strategyId || '');
  if (DISPLAY_ALIASES[sid]) return DISPLAY_ALIASES[sid];
  return stripVersionSuffix(sid);
}

/**
 * Strategy label for tables. Only NF_S0_10 appends `_W{n}` when wave is 1–4.
 * All other strategies keep the normal display name.
 */
export function formatStrategyLabel(strategyId, wave) {
  const sid = String(strategyId || '');
  const base = getStrategyDisplayName(sid);
  if (sid !== 'NF_S0_10') return base;
  const n = Number(wave);
  if (!Number.isInteger(n) || n < 1 || n > 4) return base;
  return `${base}_W${n}`;
}

/** Match decision-tape / search text against backend ID or display alias. */
export function strategyMatchesSearch(strategyId, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const sid = String(strategyId || '').toLowerCase();
  const display = getStrategyDisplayName(strategyId).toLowerCase();
  return sid.includes(q) || display.includes(q);
}
