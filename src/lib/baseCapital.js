/** Base capital deployed rates by DTE (frontend desk convention). */

import { DTE_FILTERS } from './strategyDteBuckets';

export const BASE_CAPITAL_0DTE = 180_000;
export const BASE_CAPITAL_1_2_DTE = 110_000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Margin (₹) per lot for a calendar DTE.
 * @param {number|null|undefined} dte
 * @returns {number|null} 180k for 0DTE, 110k for 1–2 DTE, else null
 */
export function marginPerLotForDte(dte) {
  if (dte == null || Number.isNaN(Number(dte))) return null;
  const n = Number(dte);
  if (n === 0) return BASE_CAPITAL_0DTE;
  if (n === 1 || n === 2) return BASE_CAPITAL_1_2_DTE;
  return null;
}

/**
 * Margin (₹) per lot for a Setup & Risk DTE section id.
 * @param {string} sectionId
 * @returns {number|null}
 */
export function marginPerLotForSection(sectionId) {
  switch (sectionId) {
    case DTE_FILTERS.NIFTY_0DT:
    case DTE_FILTERS.SENSEX_0DT:
      return BASE_CAPITAL_0DTE;
    case DTE_FILTERS.NIFTY_1DT:
    case DTE_FILTERS.NIFTY_2DT:
      return BASE_CAPITAL_1_2_DTE;
    default:
      return null;
  }
}

/**
 * @param {number} lots
 * @param {number|null|undefined} marginPerLot
 * @returns {number|null}
 */
export function baseCapitalDeployed(lots, marginPerLot) {
  if (marginPerLot == null || Number.isNaN(Number(marginPerLot))) return null;
  const nLots = Math.max(1, Number(lots) || 1);
  return nLots * Number(marginPerLot);
}

/**
 * UTC-safe calendar day difference: expiry − today (both YYYY-MM-DD).
 * @param {string|null|undefined} expiryYYYYMMDD
 * @param {string|null|undefined} todayYYYYMMDD
 * @returns {number|null}
 */
export function dteFromExpiry(expiryYYYYMMDD, todayYYYYMMDD) {
  if (!expiryYYYYMMDD || !todayYYYYMMDD) return null;
  const exp = String(expiryYYYYMMDD).slice(0, 10);
  const today = String(todayYYYYMMDD).slice(0, 10);
  if (!DATE_RE.test(exp) || !DATE_RE.test(today)) return null;
  const [ey, em, ed] = exp.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const expUtc = Date.UTC(ey, em - 1, ed);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((expUtc - todayUtc) / 86_400_000);
}
