/**
 * Manual Trade — live TradeIntents for one or more strategies (same legs broadcast).
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Mono } from '../components/ui';
import {
  buildCtxFallback,
  defaultMlLeg,
  getContractMultiplier,
  humanizeMlDetail,
} from '../utils/manualTradeHelpers';
import { getDeskBookConfig } from '../config/deskProfile';
import { API, RMS_API } from '../config/deskApi';
import { getStrategyDisplayName as cleanName } from '../lib/strategyDisplayNames';

const DESK_BROKER_ID = getDeskBookConfig().broker;

export default function ManualTrade() {
  const [configs, setConfigs] = useState([]);
  const [backendStrategies, setBackendStrategies] = useState([]);
  const [rmsStrategies, setRmsStrategies] = useState([]);
  const [symbols, setSymbols] = useState([]);
  const [lotSizes, setLotSizes] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [ctxMap, setCtxMap] = useState({});
  const [ctxLoading, setCtxLoading] = useState(false);
  const [legs, setLegs] = useState([defaultMlLeg()]);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const [strategyMenuOpen, setStrategyMenuOpen] = useState(false);
  const strategyPickerRef = useRef(null);

  const flash = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 6000);
  };

  const selectedKey = useMemo(() => [...selectedIds].sort().join('|'), [selectedIds]);

  const strategyTriggerLabel = useMemo(() => {
    if (backendStrategies.length === 0) return 'No strategies available';
    if (selectedIds.length === 0) return 'Select strategies…';
    if (selectedIds.length === backendStrategies.length) return `All strategies (${selectedIds.length})`;
    if (selectedIds.length <= 2) {
      return selectedIds.map((id) => cleanName(id)).join(', ');
    }
    return `${selectedIds.length} strategies selected`;
  }, [backendStrategies.length, selectedIds]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!strategyPickerRef.current?.contains(e.target)) setStrategyMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setStrategyMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (backendStrategies.length === 0) setStrategyMenuOpen(false);
  }, [backendStrategies.length]);

  const loadBackend = useCallback(() => {
    fetch(`${API}/strategy-configs`).then((r) => r.json()).then((d) => setConfigs(d.configs || [])).catch(() => setConfigs([]));
    fetch(`${API}/strategies`)
      .then((r) => (r.ok ? r.json() : { strategies: [] }))
      .then((d) => setBackendStrategies(d.strategies || []))
      .catch(() => setBackendStrategies([]));
    fetch(`${API}/symbols`)
      .then((r) => (r.ok ? r.json() : { symbols: [] }))
      .then((d) => setSymbols(d.symbols || []))
      .catch(() => setSymbols([]));
  }, []);

  const loadRms = useCallback(() => {
    fetch(`${RMS_API}/config`)
      .then((r) => {
        if (!r.ok) throw new Error('rms');
        return r.json();
      })
      .then((d) => {
        setRmsStrategies(Object.entries(d.strategies || {}).map(([id, cfg]) => ({ id, ...cfg })));
      })
      .catch(() => setRmsStrategies([]));
  }, []);

  useEffect(() => {
    loadBackend();
    loadRms();
  }, [loadBackend, loadRms]);

  useEffect(() => {
    if (!rmsStrategies.length) return;
    const next = {};
    rmsStrategies.forEach((s) => {
      const bc = configs.find((c) => c.strategy_id === s.id);
      const underlying = Number(bc?.underlying_scrip ?? 13);
      const mult = getContractMultiplier(underlying, symbols);
      const lot = s.lot_size ?? (s.order_quantity ? Math.round(s.order_quantity / mult) : 1);
      next[s.id] = lot;
    });
    setLotSizes((prev) => ({ ...prev, ...next }));
  }, [rmsStrategies, configs, symbols]);

  const toggleStrategy = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAll = () => {
    if (selectedIds.length === backendStrategies.length) setSelectedIds([]);
    else setSelectedIds([...backendStrategies]);
  };

  useEffect(() => {
    if (!selectedKey) {
      setCtxMap({});
      setCtxLoading(false);
      return undefined;
    }
    const ids = selectedKey.split('|');
    let cancelled = false;
    (async () => {
      setCtxLoading(true);
      const entries = await Promise.all(
        ids.map(async (id) => {
          const fallback = buildCtxFallback(configs, symbols, id);
          try {
            const r = await fetch(`${API}/strategies/${encodeURIComponent(id)}/manual-legs/context`);
            const d = await r.json().catch(() => ({}));
            const detailStr = typeof d.detail === 'string' ? d.detail : '';
            let merged;
            if (!r.ok) {
              merged = {
                strategy_id: id,
                has_snapshot: false,
                contracts: [],
                detail: detailStr || `Request failed (${r.status})`,
                ...(fallback || {}),
              };
            } else if (fallback) {
              merged = {
                ...fallback,
                ...d,
                underlying_display: d.underlying_display ?? fallback.underlying_display,
                expiry: d.expiry || fallback.expiry,
                segment: d.segment || fallback.segment,
              };
            } else {
              merged = d;
            }
            return [id, merged];
          } catch {
            return [
              id,
              {
                strategy_id: id,
                has_snapshot: false,
                contracts: [],
                detail: 'Failed to load option chain',
                ...(fallback || {}),
              },
            ];
          }
        }),
      );
      if (!cancelled) {
        setCtxMap(Object.fromEntries(entries));
        setCtxLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedKey, configs, symbols]);

  useEffect(() => {
    if (selectedIds.length === 0) {
      setLegs([defaultMlLeg()]);
      return;
    }
    const firstId = selectedIds[0];
    if (selectedIds.length === 1 && firstId === 'MANUAL_TEST') {
      setLegs([{ ...defaultMlLeg(), quantity: 20, strike: '' }]);
      return;
    }
    const bc = configs.find((c) => c.strategy_id === firstId);
    const mult = getContractMultiplier(Number(bc?.underlying_scrip ?? 13), symbols);
    const rmsRow = rmsStrategies.find((s) => s.id === firstId);
    const lotFallback = rmsRow?.lot_size ?? (rmsRow?.order_quantity ? Math.round(Number(rmsRow.order_quantity) / mult) : null);
    const lot = Math.max(1, lotSizes[firstId] ?? lotFallback ?? 1);
    const qty = lot * mult;
    setLegs([{ ...defaultMlLeg(), quantity: qty, strike: '' }]);
  }, [selectedKey, configs, symbols, rmsStrategies, lotSizes, selectedIds]);

  useEffect(() => {
    if (selectedIds.length === 0) return;
    const firstId = selectedIds[0];
    const ctx = ctxMap[firstId];
    if (!ctx?.has_snapshot) return;
    const atm = ctx.atm_strike != null && Number(ctx.atm_strike) > 0 ? String(ctx.atm_strike) : '';
    if (!atm) return;
    setLegs((prev) => {
      if (prev.length === 1 && (prev[0].strike === '' || prev[0].strike == null)) {
        return [{ ...prev[0], strike: atm }];
      }
      return prev;
    });
  }, [ctxMap, selectedKey, selectedIds]);

  const uniqueUnderlyings = useMemo(() => {
    const s = new Set();
    selectedIds.forEach((id) => {
      const u = configs.find((c) => c.strategy_id === id)?.underlying_scrip;
      if (u != null && u !== '') s.add(Number(u));
    });
    return s.size;
  }, [selectedIds, configs]);

  const allChainsReady = useMemo(() => {
    if (selectedIds.length === 0) return false;
    return selectedIds.every((id) => ctxMap[id]?.has_snapshot);
  }, [selectedIds, ctxMap]);

  const manualTestOnly = selectedIds.length === 1 && selectedIds[0] === 'MANUAL_TEST';

  const submit = async (priceMode) => {
    if (selectedIds.length === 0) {
      flash('Select at least one strategy');
      return;
    }
    if (!allChainsReady) {
      flash('Every selected strategy needs a live option chain before sending');
      return;
    }
    for (let i = 0; i < legs.length; i += 1) {
      const row = legs[i];
      if (priceMode === 'ltp_minus_1') {
        if (row.side !== 'BUY') {
          flash('LTP − 1 is a buy only');
          return;
        }
        continue;
      }
      if ((row.order_type || 'MARKET') === 'LIMIT') {
        const lp = parseFloat(String(row.limit_price ?? '').trim());
        if (!Number.isFinite(lp) || lp <= 0) {
          flash(`Leg ${i + 1}: LIMIT requires a limit price > 0`);
          return;
        }
      }
    }
    setBusy(true);
    try {
      const legsPayload = legs.map((row) => {
        const raw = String(row.strike ?? '').trim();
        const strike = parseFloat(raw);
        if (!Number.isFinite(strike) || strike <= 0) {
          throw new Error('Enter strike for each leg');
        }
        const ot = String(row.option_type || 'CE').toUpperCase();
        const orderType = priceMode === 'ltp_minus_1' ? 'LIMIT' : (row.order_type || 'MARKET');
        const leg = {
          side: row.side,
          quantity: Math.max(1, Number(row.quantity) || 1),
          strike,
          option_type: ot === 'PE' ? 'PE' : 'CE',
          order_type: orderType,
        };
        if (priceMode === 'ltp_minus_1') {
          leg.price_mode = 'ltp_minus_1';
        } else if (orderType === 'LIMIT') {
          leg.limit_price = parseFloat(String(row.limit_price).trim());
        }
        return leg;
      });

      const body = JSON.stringify({
        confirm: 'YES',
        mode: 'live',
        broker_id: DESK_BROKER_ID,
        legs: legsPayload,
      });

      const results = await Promise.allSettled(
        selectedIds.map((id) =>
          fetch(`${API}/strategies/${encodeURIComponent(id)}/manual-legs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          }).then(async (res) => {
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
              const msg =
                typeof d.detail === 'string'
                  ? d.detail
                  : Array.isArray(d.detail)
                    ? d.detail.map((x) => x.msg).join(', ')
                    : JSON.stringify(d.detail || res.status);
              throw new Error(msg);
            }
            return { id, published: d.published ?? 0, pipeline: d.pipeline };
          }),
        ),
      );

      const ok = [];
      const fail = [];
      results.forEach((r, i) => {
        const id = selectedIds[i];
        if (r.status === 'fulfilled') ok.push(r.value);
        else fail.push({ id, err: r.reason?.message || String(r.reason) });
      });

      if (ok.length) {
        flash(
          `OK: ${ok.map((o) => `${cleanName(o.id)} (${o.published})`).join(', ')}${fail.length ? ` — Failed: ${fail.map((f) => `${cleanName(f.id)}: ${f.err}`).join('; ')}` : ''}`,
        );
      } else {
        flash(`All failed: ${fail.map((f) => `${cleanName(f.id)}: ${f.err}`).join('; ')}`);
      }
      loadBackend();
      loadRms();
    } catch (e) {
      flash(e?.message || 'Send failed');
    } finally {
      setBusy(false);
    }
  };

  const getBackendCfg = (sid) => configs.find((c) => c.strategy_id === sid) || {};

  return (
    <div className="mt-page">
      <article className="mt-card mt-combined">
        <header className="mt-combined__head">
          <h1 className="mt-page-title">Manual Trade</h1>
          <p className="mt-page-sub">
            Publish the same option legs as live <strong style={{ color: 'var(--text)', fontWeight: 600 }}>TradeIntent</strong> signals to every strategy you select.
            Fills and Mongo positions update through your normal RMS / OMS path after execution.
          </p>
        </header>

        {success && <div className="mt-success-banner" role="status">{success}</div>}

        <section className="mt-combined__segment" aria-labelledby="mt-strategies-heading">
          <div className="mt-card__head">
            <h2 id="mt-strategies-heading" className="mt-section-title">
              <span>1 ·</span> Strategies
            </h2>
          </div>
          <div className="mt-strategy-dd" ref={strategyPickerRef}>
            <button
              type="button"
              id="mt-strategy-trigger"
              className="mt-strategy-dd__trigger"
              aria-haspopup="true"
              aria-expanded={strategyMenuOpen}
              aria-controls="mt-strategy-panel"
              disabled={backendStrategies.length === 0}
              onClick={() => setStrategyMenuOpen((o) => !o)}
            >
              <span className="mt-strategy-dd__value">{strategyTriggerLabel}</span>
              <span className={`mt-strategy-dd__chev ${strategyMenuOpen ? 'mt-strategy-dd__chev--open' : ''}`} aria-hidden />
            </button>
            {strategyMenuOpen && backendStrategies.length > 0 && (
              <div
                id="mt-strategy-panel"
                className="mt-strategy-dd__panel"
                role="group"
                aria-label="Choose strategies"
              >
                <div className="mt-strategy-dd__toolbar">
                  <button type="button" className="mt-btn-text" onClick={selectAll}>
                    {selectedIds.length === backendStrategies.length && backendStrategies.length > 0 ? 'Clear all' : 'Select all'}
                  </button>
                </div>
                <div className="mt-strategy-dd__list">
                  {backendStrategies.map((sid) => {
                    const bc = getBackendCfg(sid);
                    const sym = symbols.find((s) => Number(s.security_id) === Number(bc.underlying_scrip));
                    const label = sym?.display_name || sym?.symbol_name || bc.underlying_scrip || '—';
                    const checked = selectedIds.includes(sid);
                    return (
                      <label
                        key={sid}
                        className={`mt-strategy-row ${checked ? 'mt-strategy-row--on' : ''}`}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleStrategy(sid)} />
                        <span className="mt-strategy-id">{cleanName(sid)}</span>
                        <span className="mt-strategy-sym">{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {backendStrategies.length === 0 && (
              <p className="mt-strategy-dd__empty">
                No strategies returned from the API. Check <Mono size="inherit">GET /api/strategies</Mono> and backend connectivity.
              </p>
            )}
          </div>
        </section>

        {uniqueUnderlyings > 1 && selectedIds.length > 1 && (
          <div className="mt-combined__segment">
            <div className="mt-banner-multi" role="status">
              <strong style={{ color: '#fde68a' }}>Mixed underlyings:</strong>{' '}
              the same strike is resolved independently on each option chain (e.g. NIFTY vs SENSEX strikes differ).
            </div>
          </div>
        )}

        {selectedIds.length > 0 && (
          <section className="mt-combined__segment" aria-labelledby="mt-chain-heading">
            <div className="mt-card__head" style={{ marginBottom: ctxLoading ? '0.5rem' : '0.85rem' }}>
              <h2 id="mt-chain-heading" className="mt-section-title">
                <span>2 ·</span> Chain status
              </h2>
            </div>
            {ctxLoading && <div className="ml-modal__loading">Loading option chains…</div>}
            {!ctxLoading && (
              <div className="mt-chain-list">
                {selectedIds.map((id) => {
                  const ctx = ctxMap[id];
                  const ok = ctx?.has_snapshot;
                  return (
                    <div
                      key={id}
                      className={`mt-chain-item ${ok ? 'mt-chain-item--ok' : 'mt-chain-item--bad'}`}
                    >
                      <div className="mt-chain-item__top">
                        <span className="mt-chain-item__name">{cleanName(id)}</span>
                        <span className={`mt-chain-badge ${ok ? 'mt-chain-badge--ok' : 'mt-chain-badge--bad'}`}>
                          {ok ? 'Ready' : 'No chain'}
                        </span>
                      </div>
                      {ctx?.detail && !ok && (
                        <div className="mt-chain-err">{humanizeMlDetail(ctx.detail)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="mt-combined__segment">
          <h2 className="mt-section-title" style={{ marginBottom: '0.65rem' }}>
            <span>3 ·</span> Order legs
          </h2>
          <p className="mt-hint">
            Same leg rows are sent to <strong>each</strong> selected strategy. Market and limit prices apply per the live signal pipeline.
          </p>
          <div className="ml-section-label">Legs</div>
        {legs.map((row, idx) => (
          <div key={idx} className="ml-leg-card">
            <div className="ml-leg-card__head">
              <span className="ml-leg-card__index">
                Leg {idx + 1}
                {legs.length > 1 ? ` of ${legs.length}` : ''}
              </span>
              {legs.length > 1 && (
                <button type="button" className="btn-sm" onClick={() => setLegs(legs.filter((_, i) => i !== idx))} aria-label={`Remove leg ${idx + 1}`}>
                  Remove
                </button>
              )}
            </div>
            <div className="ml-leg-grid">
              <div className="ml-field">
                <label htmlFor={`mt-strike-${idx}`}>Strike</label>
                <input
                  id={`mt-strike-${idx}`}
                  className="ml-input"
                  type="number"
                  step="any"
                  min={0}
                  placeholder="e.g. 82000"
                  value={row.strike}
                  onChange={(e) => {
                    const n = [...legs];
                    n[idx] = { ...n[idx], strike: e.target.value };
                    setLegs(n);
                  }}
                />
              </div>
              <div className="ml-field">
                <label htmlFor={`mt-opt-${idx}`}>Type</label>
                <select
                  id={`mt-opt-${idx}`}
                  className="ml-select"
                  value={row.option_type}
                  onChange={(e) => {
                    const n = [...legs];
                    n[idx] = { ...n[idx], option_type: e.target.value };
                    setLegs(n);
                  }}
                >
                  <option value="CE">CE</option>
                  <option value="PE">PE</option>
                </select>
              </div>
              <div className="ml-field">
                <label htmlFor={`mt-side-${idx}`}>Side</label>
                <select
                  id={`mt-side-${idx}`}
                  className="ml-select"
                  value={row.side}
                  onChange={(e) => {
                    const n = [...legs];
                    n[idx] = { ...n[idx], side: e.target.value };
                    setLegs(n);
                  }}
                >
                  <option value="BUY">Buy</option>
                  <option value="SELL">Sell</option>
                </select>
              </div>
              <div className="ml-field">
                <label htmlFor={`mt-qty-${idx}`}>Qty</label>
                <input
                  id={`mt-qty-${idx}`}
                  className="ml-input"
                  type="number"
                  min={1}
                  value={row.quantity}
                  onChange={(e) => {
                    const n = [...legs];
                    n[idx] = { ...n[idx], quantity: e.target.value };
                    setLegs(n);
                  }}
                />
              </div>
            </div>
            <div className="ml-order-row">
              <span className="ml-order-row__label">Order</span>
              <div className="ml-seg" role="group" aria-label="Market or limit">
                <button
                  type="button"
                  className={`ml-seg__btn ${(row.order_type || 'MARKET') === 'MARKET' ? 'ml-seg__btn--active' : ''}`}
                  onClick={() => {
                    const n = [...legs];
                    n[idx] = { ...n[idx], order_type: 'MARKET', limit_price: '' };
                    setLegs(n);
                  }}
                >
                  Market
                </button>
                <button
                  type="button"
                  className={`ml-seg__btn ${(row.order_type || 'MARKET') === 'LIMIT' ? 'ml-seg__btn--active' : ''}`}
                  onClick={() => {
                    const n = [...legs];
                    n[idx] = { ...n[idx], order_type: 'LIMIT' };
                    setLegs(n);
                  }}
                >
                  Limit
                </button>
              </div>
              {(row.order_type || 'MARKET') === 'LIMIT' && (
                <div className="ml-field" style={{ flex: '1 1 120px', maxWidth: 140, marginLeft: 'auto' }}>
                  <label htmlFor={`mt-limit-${idx}`}>Limit ₹</label>
                  <input
                    id={`mt-limit-${idx}`}
                    className="ml-input"
                    type="number"
                    step="any"
                    min={0}
                    placeholder="Price"
                    value={row.limit_price}
                    onChange={(e) => {
                      const n = [...legs];
                      n[idx] = { ...n[idx], limit_price: e.target.value };
                      setLegs(n);
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
        <div className="ml-add-leg">
          <button
            type="button"
            className="btn-sm"
            onClick={() => {
              const baseQty = legs[0]?.quantity ?? 1;
              const baseStrike = legs[0]?.strike ?? '';
              setLegs([...legs, { ...defaultMlLeg(), quantity: baseQty, strike: baseStrike }]);
            }}
          >
            + Add leg
          </button>
        </div>

          <div className="mt-actions">
            <button type="button" className="ml-btn ml-btn--primary" onClick={() => submit()} disabled={busy || ctxLoading || selectedIds.length === 0 || !allChainsReady}>
              {busy ? 'Sending…' : 'Send orders'}
            </button>
            {manualTestOnly ? (
              <button
                type="button"
                className="ml-btn"
                onClick={() => submit('ltp_minus_1')}
                disabled={busy || ctxLoading || !allChainsReady}
                title="Live Kotak buy at the chain price minus ₹1. Chase will modify it and it can fill."
              >
                {busy ? 'Sending…' : 'Fire at LTP − 1'}
              </button>
            ) : null}
          </div>
          {manualTestOnly ? (
            <p className="ml-hint">
              Fire at LTP − 1 places a live buy one rupee under the chain. Kotak chase modifies that order toward the market, and it can fill.
            </p>
          ) : null}
        </section>
      </article>
    </div>
  );
}
