/** Shared helpers for Manual Trade page (live TradeIntents). */

export const formatCfgExpiry = (exp) => {
  if (exp == null || exp === '') return '';
  if (typeof exp === 'string') return exp.slice(0, 10);
  if (typeof exp === 'object' && exp !== null && typeof exp.toISOString === 'function') return exp.toISOString().slice(0, 10);
  return String(exp).slice(0, 10);
};

export const humanizeMlDetail = (detail) => {
  if (detail == null || detail === '') return '';
  const s = String(detail).trim();
  if (/^not\s*found$/i.test(s)) {
    return 'Strategy or context was not found. Confirm the strategy exists and settings are saved.';
  }
  return s;
};

export const buildCtxFallback = (configs, symbols, strategyId) => {
  const bc = configs.find((c) => c.strategy_id === strategyId);
  if (!bc) return null;
  const u = Number(bc.underlying_scrip ?? 0);
  const sym = symbols.find((s) => Number(s.security_id) === u);
  return {
    has_snapshot: false,
    contracts: [],
    underlying_scrip: u || undefined,
    underlying_display: sym?.display_name || sym?.symbol_name || (u ? String(u) : undefined),
    segment: sym?.segment || bc.segment || '',
    expiry: formatCfgExpiry(bc.expiry) || null,
  };
};

export const defaultMlLeg = () => ({
  strike: '',
  option_type: 'CE',
  side: 'BUY',
  quantity: 1,
  order_type: 'MARKET',
  limit_price: '',
});

/** Qty per 1 lot — prefer /api/symbols row; else NIFTY=65, SENSEX=20 (matches Backend). */
export const getContractMultiplier = (underlyingScrip, symbolList) => {
  const u = Number(underlyingScrip);
  const row = (symbolList || []).find((x) => Number(x.security_id) === u);
  if (row != null && row.lot_size != null && row.lot_size !== '') return Number(row.lot_size);
  if (u === 13) return 65;
  if (u === 15) return 20;
  return 25;
};
