/** NF_S0_10-only helpers for grouping open positions into wave sections. */

import { formatStrategyLabel, getStrategyDisplayName } from './strategyDisplayNames';

export const NF_S0_10_ID = 'NF_S0_10';
export const NF_S0_10_WAVES = [1, 2, 3, 4];

export function parseWaveNumber(wave) {
  if (wave == null || wave === '') return null;
  const n = Number(wave);
  if (!Number.isInteger(n) || n < 1 || n > 4) return null;
  return n;
}

function isBookHedgeRow(row) {
  const role = String(row?.leg_role || '').toLowerCase();
  if (role === 'hedge_call' || role === 'hedge_put') return true;
  // Explicit book tag only — Number(null) === 0, so do not coerce null/'' here.
  return row?.wave === 0 || row?.wave === '0';
}

/**
 * Group NF_S0_10 positions into fixed W1–W4 buckets plus untagged leftovers.
 * Book-level hedges (wave 0 / hedge_* roles) are mirrored into each active wave
 * as a display-only pair with per-wave qty share so sections look complete.
 * Rows for other strategies are ignored.
 */
export function groupNfS010Positions(positions) {
  const waves = { 1: [], 2: [], 3: [], 4: [] };
  const untagged = [];
  const bookHedges = [];

  for (const row of positions || []) {
    if (String(row?.strategy_id || '') !== NF_S0_10_ID) continue;
    if (isBookHedgeRow(row)) {
      bookHedges.push(row);
      continue;
    }
    const wave = parseWaveNumber(row.wave);
    if (wave != null) waves[wave].push(row);
    else untagged.push(row);
  }

  const activeWaves = NF_S0_10_WAVES.filter((wave) => waves[wave].length > 0);
  if (bookHedges.length > 0) {
    if (activeWaves.length === 0) {
      untagged.push(...bookHedges);
    } else {
      const n = activeWaves.length;
      for (const wave of activeWaves) {
        for (const hedge of bookHedges) {
          const fullQty = Number(hedge.quantity) || 0;
          const shareQty = Math.max(1, Math.round(fullQty / n));
          const fullUnreal = Number(hedge.unrealized ?? hedge.unrealized_pnl ?? 0);
          waves[wave].push({
            ...hedge,
            wave,
            quantity: shareQty,
            unrealized: fullUnreal / n,
            unrealized_pnl: fullUnreal / n,
            _bookHedgeMirror: true,
          });
        }
      }
    }
  }

  return { waves, untagged };
}

export function nfS010WaveSectionLabel(wave) {
  return formatStrategyLabel(NF_S0_10_ID, wave);
}

export function nfS010UntaggedSectionLabel() {
  return `${getStrategyDisplayName(NF_S0_10_ID)}_UNTAGGED`;
}
