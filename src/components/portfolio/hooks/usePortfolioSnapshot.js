import { useCallback, useEffect, useState } from 'react';

import { getDeskBookConfig } from '../../../config/deskProfile';
import { API } from '../../../config/deskApi';

const deskBook = getDeskBookConfig();

function parseCapital(raw) {
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function buildParams({
  source,
  preset,
  utilization,
  maxWeight,
  minWeight,
  capital,
  symbolScope,
}) {
  return {
    source,
    preset,
    utilization,
    max_weight: maxWeight,
    min_weight: minWeight,
    broker: deskBook.broker || undefined,
    capital: parseCapital(capital),
    ...(symbolScope && symbolScope !== 'ALL' ? { symbol: symbolScope } : {}),
  };
}

function applyFrontierLotsToSnapshot(prev, frontier) {
  if (!prev || !frontier) return prev;
  const recMap = frontier.recommended_lots || {};
  const updates = frontier.strategy_lot_updates || {};
  const strategies = (prev.strategies || []).map((s) => {
    const sid = s.strategy_id;
    const patch = updates[sid];
    if (patch) {
      return { ...s, ...patch };
    }
    if (Object.prototype.hasOwnProperty.call(recMap, sid)) {
      const lots = Number(recMap[sid]) || 0;
      return {
        ...s,
        recommended_lots: lots,
        delta_lots: lots - (Number(s.current_lots) || 0),
      };
    }
    return s;
  });
  return {
    ...prev,
    strategies,
    efficient_frontier: frontier,
    lots_source: frontier.lots_source || (frontier.optimal ? 'frontier_optimal' : prev.lots_source),
  };
}

function mergeSimulatedMetrics(prev, sim) {
  if (!prev || !sim) return prev;
  const metrics = sim.metrics || {};
  const health = { ...(prev.portfolio_health || {}) };
  if (sim.exposure_pct != null) health.exposure_pct = sim.exposure_pct;
  return {
    ...prev,
    portfolio_metrics: {
      ...(prev.portfolio_metrics || {}),
      ...metrics,
    },
    equity_curve: sim.equity_curve || prev.equity_curve,
    portfolio_health: health,
    avg_pairwise_correlation:
      sim.avg_pairwise_correlation != null
        ? sim.avg_pairwise_correlation
        : prev.avg_pairwise_correlation,
  };
}

export function usePortfolioSnapshot({
  source,
  preset,
  utilization,
  maxWeight,
  minWeight,
  capital,
  symbolScope = 'ALL',
}) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [frontierLoading, setFrontierLoading] = useState(false);
  const [error, setError] = useState('');

  const simulateLots = useCallback(async (lots) => {
    const body = {
      lots: lots || {},
      source,
      utilization,
      broker: deskBook.broker || undefined,
      capital: parseCapital(capital),
    };
    if (symbolScope && symbolScope !== 'ALL') {
      body.symbol = symbolScope;
    }
    const r = await fetch(`${API}/portfolio/simulate-lots`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }, [source, utilization, capital, symbolScope]);

  const fetchFrontier = useCallback(async (overrides = {}) => {
    setFrontierLoading(true);
    try {
      const body = buildParams({
        source: overrides.source ?? source,
        preset: overrides.preset ?? preset,
        utilization: overrides.utilization ?? utilization,
        maxWeight: overrides.maxWeight ?? maxWeight,
        minWeight: overrides.minWeight ?? minWeight,
        capital: overrides.capital ?? capital,
        symbolScope: overrides.symbolScope ?? symbolScope,
      });
      const r = await fetch(`${API}/portfolio/frontier`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      const frontier = await r.json();

      setSnapshot((prev) => applyFrontierLotsToSnapshot(prev, frontier));

      const recMap = frontier.recommended_lots || {};
      if (frontier.lots_source === 'frontier_optimal' && Object.keys(recMap).length) {
        try {
          const sim = await simulateLots(recMap);
          setSnapshot((prev) => mergeSimulatedMetrics(prev, sim));
        } catch (simErr) {
          // Keep Optimal REC even if metric refresh fails.
          setError(String(simErr.message || simErr));
        }
      }
      return frontier;
    } catch (e) {
      setError(String(e.message || e));
      return null;
    } finally {
      setFrontierLoading(false);
    }
  }, [source, preset, utilization, maxWeight, minWeight, capital, symbolScope, simulateLots]);

  const runOptimize = useCallback(async (srcOverride, overrides = {}) => {
    setLoading(true);
    setError('');
    const activeSource = srcOverride || source;
    const activeScope = overrides.symbolScope ?? symbolScope;
    try {
      const body = buildParams({
        source: activeSource,
        preset: overrides.preset ?? preset,
        utilization: overrides.utilization ?? utilization,
        maxWeight: overrides.maxWeight ?? maxWeight,
        minWeight: overrides.minWeight ?? minWeight,
        capital: overrides.capital ?? capital,
        symbolScope: activeScope,
      });
      const r = await fetch(`${API}/portfolio/optimize`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setSnapshot({ ...data, lots_source: data.lots_source || 'continuous_pending' });
      fetchFrontier({
        source: activeSource,
        preset: overrides.preset ?? preset,
        utilization: overrides.utilization ?? utilization,
        maxWeight: overrides.maxWeight ?? maxWeight,
        minWeight: overrides.minWeight ?? minWeight,
        capital: overrides.capital ?? capital,
        symbolScope: activeScope,
      });
      return data;
    } catch (e) {
      setError(String(e.message || e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [source, preset, utilization, maxWeight, minWeight, capital, symbolScope, fetchFrontier]);

  const fetchSnapshot = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const body = buildParams({
        source,
        preset,
        utilization,
        maxWeight,
        minWeight,
        capital,
        symbolScope,
      });
      const params = new URLSearchParams();
      Object.entries(body).forEach(([k, v]) => {
        if (v != null) params.set(k, String(v));
      });
      const r = await fetch(`${API}/portfolio/snapshot?${params}`, { credentials: 'include' });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setSnapshot({ ...data, lots_source: data.lots_source || 'continuous_pending' });
      fetchFrontier();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, [source, preset, utilization, maxWeight, minWeight, capital, symbolScope, fetchFrontier]);

  const loadConfig = useCallback(async () => {
    try {
      const r = await fetch(`${API}/portfolio/config`, { credentials: 'include' });
      if (!r.ok) return null;
      return r.json();
    } catch {
      return null;
    }
  }, []);

  return {
    snapshot,
    loading,
    frontierLoading,
    error,
    setError,
    setSnapshot,
    runOptimize,
    fetchSnapshot,
    fetchFrontier,
    simulateLots,
    loadConfig,
  };
}

export function useDebouncedOptimize(runOptimize, deps, delay = 300) {
  useEffect(() => {
    const t = setTimeout(() => runOptimize(), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
