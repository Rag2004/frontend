import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { getDeskBookConfig } from '../../config/deskProfile';
import { useApiPoll } from '../../hooks/useApiPoll';
import { Button, Panel, PanelBody, PanelHeader } from '../ui';
import { AllocationCharts } from './AllocationCharts';
import { AllocationGrid } from './AllocationGrid';
import { CorrelationAnalytics } from './CorrelationAnalytics';
import { EfficientFrontierChart } from './EfficientFrontierChart';
import { EquityCurveChart } from './EquityCurveChart';
import { OptimizerControlCenter, resolveOptimizerPreset } from './OptimizerControlCenter';
import { PortfolioActionBar } from './PortfolioActionBar';
import { PortfolioHeader } from './PortfolioHeader';
import { PortfolioHealthPanel } from './PortfolioHealthPanel';
import { RegimeTable } from './RegimeTable';
import { buildKpiItems, PortfolioKpiStrip } from './PortfolioKpiStrip';
import { SymbolScopeBar } from './SymbolScopeBar';
import { usePortfolioSnapshot } from './hooks/usePortfolioSnapshot';
import { usePortfolioDerived } from './hooks/usePortfolioDerived';
import { exportAllocationCsv, loadDraft, saveDraft } from './utils/exportAllocation';
import { cleanStrategyName, fmtINR } from './utils/formatters';
import { API } from '../../config/deskApi';

const deskBook = getDeskBookConfig();

function isMissingStrategy(s) {
  return (s?.data_source || 'none') === 'none';
}

function seedManualFromStrategies(rows) {
  const next = {};
  for (const s of rows || []) {
    // Missing/deleted CSV strategies must never keep a Manual lot assignment.
    next[s.strategy_id] = isMissingStrategy(s) ? 0 : (Number(s.recommended_lots) || 0);
  }
  return next;
}

function fmtNum(v, digits = 2) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return Number(v).toFixed(digits);
}

function deltaCell(manual, opt, money = false) {
  if (manual == null || opt == null) return '—';
  const d = Number(manual) - Number(opt);
  if (!Number.isFinite(d)) return '—';
  if (money) {
    const sign = d > 0 ? '+' : '';
    return `${sign}${fmtINR(d)}`;
  }
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(2)}`;
}

export function PortfolioPage() {
  const [source, setSource] = useState('backtest');
  const [preset, setPreset] = useState('max_sharpe');
  const [utilization, setUtilization] = useState(0.8);
  const [maxWeight, setMaxWeight] = useState(0.25);
  const [minWeight, setMinWeight] = useState(0.05);
  const [capitalInput, setCapitalInput] = useState('2500000');
  const [applyOpen, setApplyOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [symbolScope, setSymbolScope] = useState('ALL');
  const [spotBusy, setSpotBusy] = useState(false);
  const [manualLots, setManualLots] = useState({});
  const [manualDirty, setManualDirty] = useState(false);
  const [manualMetrics, setManualMetrics] = useState(null);

  const {
    snapshot,
    loading,
    frontierLoading,
    error,
    setError,
    runOptimize,
    fetchSnapshot,
    simulateLots,
    loadConfig,
  } = usePortfolioSnapshot({
    source,
    preset,
    utilization,
    maxWeight,
    minWeight,
    capital: capitalInput,
    symbolScope,
  });

  const derived = usePortfolioDerived(snapshot, utilization);
  const {
    strategies,
    pm,
    baseline,
    capital,
    deployable,
    changesCount,
    sharpeDelta,
    volDelta,
    heatmapWeights,
    aggregateRisk,
    totalDrawdownRec,
    totalLotsRec,
    totalPnlDeployed,
    health,
    insights,
  } = derived;

  // Seed / re-seed Manual from Rec when optimizer snapshot changes (unless user edited).
  // Always force MISSING strategies to Manual=0 even if the user previously edited.
  useEffect(() => {
    if (!strategies?.length) return;
    if (!manualDirty) {
      setManualLots(seedManualFromStrategies(strategies));
      return;
    }
    setManualLots((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const s of strategies) {
        if (!isMissingStrategy(s)) continue;
        if (Number(next[s.strategy_id] || 0) !== 0) {
          next[s.strategy_id] = 0;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [strategies, manualDirty, snapshot?.updated_at, snapshot?.preset, snapshot?.lots_source]);

  useEffect(() => {
    const next = resolveOptimizerPreset(preset);
    if (next !== preset) setPreset(next);
  }, [preset]);

  useEffect(() => {
    loadConfig().then((cfg) => {
      if (!cfg) return;
      if (cfg.default_preset) setPreset(resolveOptimizerPreset(cfg.default_preset));
      if (cfg.utilization != null) setUtilization(cfg.utilization);
      if (cfg.max_weight != null) setMaxWeight(cfg.max_weight);
      if (cfg.min_weight != null) setMinWeight(cfg.min_weight);
      if (cfg.default_source) {
        const src = String(cfg.default_source).toLowerCase();
        // Platform default is backtest; treat hybrid / unknown as backtest.
        setSource(src === 'live' ? 'live' : 'backtest');
      }
    });
  }, [loadConfig]);

  useEffect(() => {
    setHasDraft(!!loadDraft());
  }, [snapshot]);

  useApiPoll(fetchSnapshot, 60000, true, []);

  const settingsReady = useRef(false);
  useEffect(() => {
    if (!settingsReady.current) {
      settingsReady.current = true;
      return undefined;
    }
    // New optimize result should re-seed Manual from Rec.
    setManualDirty(false);
    const t = setTimeout(() => runOptimize(), 650);
    return () => clearTimeout(t);
  }, [source, preset, utilization, maxWeight, minWeight, capitalInput, symbolScope, runOptimize]);

  // Debounced Manual simulation
  useEffect(() => {
    if (!manualDirty || !Object.keys(manualLots).length) {
      setManualMetrics(null);
      return undefined;
    }
    const t = setTimeout(async () => {
      try {
        const data = await simulateLots(manualLots);
        setManualMetrics(data);
      } catch (e) {
        setError(String(e.message || e));
      }
    }, 350);
    return () => clearTimeout(t);
  }, [manualLots, manualDirty, simulateLots, setError]);

  const handleDataChange = useCallback((newSource) => {
    setSource(newSource);
    setManualDirty(false);
    runOptimize(newSource);
  }, [runOptimize]);

  const handleManualLotChange = useCallback((strategyId, lots) => {
    const row = strategies.find((s) => s.strategy_id === strategyId);
    if (isMissingStrategy(row)) {
      setManualLots((prev) => ({ ...prev, [strategyId]: 0 }));
      return;
    }
    setManualDirty(true);
    setManualLots((prev) => ({ ...prev, [strategyId]: lots }));
  }, [strategies]);

  const handleResetManual = useCallback(() => {
    setManualDirty(false);
    setManualLots(seedManualFromStrategies(strategies));
    setManualMetrics(null);
  }, [strategies]);

  const handleBulkUpload = async (file) => {
    if (!file) return;
    setBulkBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(`${API}/portfolio/backtest/upload`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail?.message || JSON.stringify(data.detail) || r.statusText);
      handleDataChange('backtest');
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBulkBusy(false);
    }
  };

  const handleSpotUpload = async (file) => {
    if (!file) return;
    setSpotBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(`${API}/portfolio/spot/upload`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail?.message || JSON.stringify(data.detail) || r.statusText);
      await fetchSnapshot();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSpotBusy(false);
    }
  };

  const applyLotsTarget = useMemo(() => {
    const out = {};
    for (const s of strategies) {
      const sid = s.strategy_id;
      if (isMissingStrategy(s)) {
        out[sid] = 0;
        continue;
      }
      out[sid] = manualDirty
        ? (manualLots[sid] ?? s.recommended_lots ?? 0)
        : (s.recommended_lots ?? 0);
    }
    return out;
  }, [strategies, manualDirty, manualLots]);

  const handleApply = async () => {
    setApplying(true);
    try {
      const r = await fetch(`${API}/portfolio/apply-allocation`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          allocations: applyLotsTarget,
          preset: snapshot?.preset,
          capital: capital.capital_available,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || r.statusText);
      setApplyOpen(false);
      setManualDirty(false);
      await fetchSnapshot();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setApplying(false);
    }
  };

  const handleSaveDraft = () => {
    saveDraft({ source, preset, utilization, maxWeight, minWeight, capital: capitalInput, symbolScope, manualLots }, strategies);
    setDraftSaved(true);
    setHasDraft(true);
    setTimeout(() => setDraftSaved(false), 2000);
  };

  const handleExport = () => exportAllocationCsv(strategies, snapshot);

  const kpiItems = buildKpiItems({
    capital,
    deployable,
    pm,
    utilization,
    sharpeDelta,
    totalPnlDeployed,
    totalDrawdownRec,
    totalLotsRec,
  });

  const isPaper = deskBook.broker === 'mock';
  const manualDiffCount = strategies.filter(
    (s) => Number(manualLots[s.strategy_id] ?? s.recommended_lots ?? 0) !== Number(s.recommended_lots ?? 0),
  ).length;
  const actionBarVisible = changesCount > 0 || hasDraft || manualDirty;
  const availableSymbols = snapshot?.available_symbols || [];
  const scopeLabel = symbolScope !== 'ALL' ? symbolScope : null;

  const totalLotsManual = useMemo(
    () => Object.values(manualLots).reduce((sum, n) => sum + (Number(n) || 0), 0),
    [manualLots],
  );

  const optMetrics = {
    sharpe: pm.portfolio_sharpe_deployed ?? pm.portfolio_sharpe,
    dailyPnl: pm.expected_daily_pnl_deployed ?? pm.expected_daily_pnl,
    totalPnl: totalPnlDeployed ?? pm.total_pnl_deployed ?? pm.total_pnl,
    maxDd: pm.max_drawdown_deployed ?? pm.max_drawdown,
    totalDd: totalDrawdownRec,
    calmar: pm.portfolio_calmar_deployed ?? pm.portfolio_calmar,
    exposure: health.exposure_pct,
    lots: totalLotsRec,
  };
  const man = manualMetrics?.metrics || {};
  const manMetrics = {
    sharpe: man.portfolio_sharpe_deployed,
    dailyPnl: man.expected_daily_pnl_deployed,
    totalPnl: man.total_pnl_deployed,
    maxDd: man.max_drawdown_deployed,
    calmar: man.portfolio_calmar_deployed,
    exposure: manualMetrics?.exposure_pct,
    lots: man.total_lots ?? totalLotsManual,
  };

  const showSensitivity = manualDirty && !!manualMetrics;

  const applyPreviewRows = strategies.filter((s) => {
    const target = applyLotsTarget[s.strategy_id] ?? 0;
    return Number(target) !== Number(s.current_lots ?? 0);
  });

  return (
    <div className="card pnl-page pnl-page--inst pf-inst pf-inst-layout">
      <PortfolioHeader
        preset={snapshot?.preset || preset}
        updatedAt={snapshot?.updated_at}
        loading={loading}
        csvSpan={snapshot?.backtest}
        onRecalculate={() => {
          setManualDirty(false);
          runOptimize();
        }}
      />

      <SymbolScopeBar
        value={symbolScope}
        onChange={setSymbolScope}
        symbols={availableSymbols}
        loading={loading}
        strategiesInScope={snapshot?.strategies_in_scope}
      />

      {snapshot?.scope_message && (
        <div className="text-sm text-pf-warning px-1" role="status">{snapshot.scope_message}</div>
      )}

      {error && (
        <div role="alert" className="pf-alert">
          <span>{error}</span>
          <button type="button" className="pf-alert__close" onClick={() => setError('')} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {draftSaved && (
        <div className="text-[var(--pf-meta-size)] text-pf-success px-1" aria-live="polite">Draft saved locally.</div>
      )}

      <PortfolioKpiStrip loading={loading && !snapshot} items={kpiItems} />

      <div className="pf-inst-row-2">
        <PortfolioHealthPanel health={health} loading={loading && !snapshot} />
        <OptimizerControlCenter
          source={source}
          setSource={setSource}
          preset={preset}
          setPreset={setPreset}
          utilization={utilization}
          setUtilization={setUtilization}
          maxWeight={maxWeight}
          setMaxWeight={setMaxWeight}
          minWeight={minWeight}
          setMinWeight={setMinWeight}
          capital={capitalInput}
          setCapital={setCapitalInput}
          pm={pm}
          baseline={baseline}
          deployable={deployable}
          aggregateRisk={-(totalDrawdownRec || aggregateRisk)}
          health={health}
        />
      </div>

      <div className="pf-inst-analytics-row">
        <AllocationCharts strategies={strategies} deployable={deployable} loading={loading && !snapshot} />
        <CorrelationAnalytics
          loading={loading && !snapshot}
          snapshot={snapshot}
          heatmapWeights={heatmapWeights}
          insights={insights}
        />
      </div>

      <EfficientFrontierChart
        frontier={snapshot?.efficient_frontier}
        strategyIds={snapshot?.strategy_ids || (strategies || []).map((s) => s.strategy_id)}
        loading={frontierLoading && !snapshot?.efficient_frontier?.frontier?.length}
        scopeLabel={snapshot?.symbol_scope || symbolScope}
        lotsSource={snapshot?.lots_source}
      />

      <EquityCurveChart
        equityCurve={snapshot?.equity_curve}
        manualEquityCurve={showSensitivity ? manualMetrics?.equity_curve : null}
        pathMaxDrawdown={pm.max_drawdown_deployed ?? pm.max_drawdown}
        totalLots={totalLotsRec}
        loading={loading && !snapshot}
      />

      {showSensitivity && (
        <div className="pf-inst-card p-4" role="region" aria-label="Sensitivity analysis Optimizer vs Manual">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="pf-inst-section-title">Sensitivity — Optimizer vs Manual</h2>
              <p className="text-[var(--pf-meta-size)] text-pf-muted mt-0.5">
                Metrics recompute when Manual lots differ from Rec ({manualDiffCount} strateg{manualDiffCount === 1 ? 'y' : 'ies'} edited)
              </p>
            </div>
            <Button type="button" variant="ghost" size="xs" onClick={handleResetManual}>
              Reset Manual to Rec
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[0.72rem] min-w-[520px]">
              <thead>
                <tr className="text-pf-muted uppercase text-[0.62rem]">
                  <th className="text-left py-2">Metric</th>
                  <th className="text-right py-2">Optimizer (Rec)</th>
                  <th className="text-right py-2">Manual</th>
                  <th className="text-right py-2">Δ</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-pf-border/50">
                  <td className="py-2 text-pf-muted">Total PnL</td>
                  <td className="py-2 text-right font-mono tabular-nums">{fmtINR(optMetrics.totalPnl)}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{fmtINR(manMetrics.totalPnl)}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{deltaCell(manMetrics.totalPnl, optMetrics.totalPnl, true)}</td>
                </tr>
                <tr className="border-t border-pf-border/50">
                  <td className="py-2 text-pf-muted">MaxDD (path)</td>
                  <td className="py-2 text-right font-mono tabular-nums">{fmtINR(optMetrics.maxDd)}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{fmtINR(manMetrics.maxDd)}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{deltaCell(manMetrics.maxDd, optMetrics.maxDd, true)}</td>
                </tr>
                <tr className="border-t border-pf-border/50">
                  <td className="py-2 text-pf-muted">Daily PnL</td>
                  <td className="py-2 text-right font-mono tabular-nums">{fmtINR(optMetrics.dailyPnl)}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{fmtINR(manMetrics.dailyPnl)}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{deltaCell(manMetrics.dailyPnl, optMetrics.dailyPnl, true)}</td>
                </tr>
                <tr className="border-t border-pf-border/50">
                  <td className="py-2 text-pf-muted">Sharpe</td>
                  <td className="py-2 text-right font-mono tabular-nums">{fmtNum(optMetrics.sharpe, 4)}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{fmtNum(manMetrics.sharpe, 4)}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{deltaCell(manMetrics.sharpe, optMetrics.sharpe)}</td>
                </tr>
                <tr className="border-t border-pf-border/50">
                  <td className="py-2 text-pf-muted">Calmar</td>
                  <td className="py-2 text-right font-mono tabular-nums">{fmtNum(optMetrics.calmar, 4)}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{fmtNum(manMetrics.calmar, 4)}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{deltaCell(manMetrics.calmar, optMetrics.calmar)}</td>
                </tr>
                <tr className="border-t border-pf-border/50">
                  <td className="py-2 text-pf-muted">Exposure %</td>
                  <td className="py-2 text-right font-mono tabular-nums">{fmtNum(optMetrics.exposure, 1)}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{fmtNum(manMetrics.exposure, 1)}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{deltaCell(manMetrics.exposure, optMetrics.exposure)}</td>
                </tr>
                <tr className="border-t border-pf-border/50">
                  <td className="py-2 text-pf-muted">Total lots</td>
                  <td className="py-2 text-right font-mono tabular-nums">{optMetrics.lots}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{manMetrics.lots}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{deltaCell(manMetrics.lots, optMetrics.lots)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {manualDirty && !manualMetrics && (
        <div className="pf-inst-card p-3 text-[var(--pf-meta-size)] text-pf-muted" role="status">
          Computing Manual metrics for sensitivity comparison…
        </div>
      )}

      <AllocationGrid
        strategies={strategies}
        onDataChange={handleDataChange}
        onBulkUpload={handleBulkUpload}
        bulkBusy={bulkBusy}
        isPaper={isPaper}
        manualLots={manualLots}
        onManualLotChange={handleManualLotChange}
        manualDirty={manualDirty}
        onResetManual={handleResetManual}
        onError={setError}
        lotsSource={snapshot?.lots_source}
        frontierLoading={frontierLoading}
      />

      <RegimeTable
        strategies={strategies}
        regimeMetrics={snapshot?.regime_metrics}
        regimeConfig={snapshot?.regime_config}
        onSpotUpload={handleSpotUpload}
        spotBusy={spotBusy}
      />

      <PortfolioActionBar
        visible={actionBarVisible}
        changesCount={manualDirty ? manualDiffCount : changesCount}
        sharpeDelta={sharpeDelta}
        volDelta={volDelta}
        scopeLabel={scopeLabel}
        onSaveDraft={handleSaveDraft}
        onExport={handleExport}
        onCompare={() => setCompareOpen(true)}
        onApply={() => setApplyOpen(true)}
      />

      {applyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Panel className="max-w-md w-full">
            <PanelHeader title={scopeLabel ? `Apply ${scopeLabel} allocation to RMS?` : 'Apply allocation to RMS?'} />
            <PanelBody>
              <p className="text-[0.65rem] text-desk-muted">
                {manualDirty
                  ? 'Applying Manual lots (edited). '
                  : 'Applying Recommended lots from optimizer. '}
                {scopeLabel
                  ? `Updates lot_size for ${scopeLabel} strategies only. Other symbols are unchanged.`
                  : 'Updates lot_size in risk config. Live orders use new sizes on next signal.'}
              </p>
              <ul className="mt-3 max-h-40 overflow-y-auto font-mono text-[0.62rem] space-y-1">
                {applyPreviewRows.map((s) => (
                  <li key={s.strategy_id}>
                    {cleanStrategyName(s.strategy_id)}: {s.current_lots} → {applyLotsTarget[s.strategy_id]} lots
                  </li>
                ))}
              </ul>
              {!applyPreviewRows.length && (
                <p className="mt-3 text-[0.65rem] text-desk-muted">No lot changes vs current RMS book.</p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setApplyOpen(false)}>Cancel</Button>
                <Button type="button" variant="primary" size="sm" disabled={applying} onClick={handleApply}>
                  {applying ? 'Applying…' : 'Confirm apply'}
                </Button>
              </div>
            </PanelBody>
          </Panel>
        </div>
      )}

      {compareOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
          <div className="w-full max-w-lg h-full bg-[var(--pf-card)] border-l border-pf-border shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-pf-border">
              <h2 className="text-sm font-semibold text-pf-text">Optimizer vs Manual</h2>
              <button type="button" onClick={() => setCompareOpen(false)} aria-label="Close compare panel">
                <X className="h-5 w-5 text-pf-muted" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[var(--pf-meta-size)] text-pf-muted">
                  {manualDirty ? 'Manual lots differ from Rec' : 'Manual matches Rec — edit Manual column to compare'}
                </p>
                {manualDirty && (
                  <Button type="button" variant="ghost" size="xs" onClick={handleResetManual}>Reset to Rec</Button>
                )}
              </div>

              <table className="w-full text-[0.72rem]">
                <thead>
                  <tr className="text-pf-muted uppercase text-[0.62rem]">
                    <th className="text-left py-2">Metric</th>
                    <th className="text-right py-2">Optimizer</th>
                    <th className="text-right py-2">Manual</th>
                    <th className="text-right py-2">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-pf-border/50">
                    <td className="py-2 text-pf-muted">Total PnL</td>
                    <td className="py-2 text-right font-mono tabular-nums">{fmtINR(optMetrics.totalPnl)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{manualDirty ? fmtINR(manMetrics.totalPnl) : fmtINR(optMetrics.totalPnl)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{manualDirty ? deltaCell(manMetrics.totalPnl, optMetrics.totalPnl, true) : '—'}</td>
                  </tr>
                  <tr className="border-t border-pf-border/50">
                    <td className="py-2 text-pf-muted">Sharpe</td>
                    <td className="py-2 text-right font-mono tabular-nums">{fmtNum(optMetrics.sharpe, 4)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{manualDirty ? fmtNum(manMetrics.sharpe, 4) : fmtNum(optMetrics.sharpe, 4)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{manualDirty ? deltaCell(manMetrics.sharpe, optMetrics.sharpe) : '—'}</td>
                  </tr>
                  <tr className="border-t border-pf-border/50">
                    <td className="py-2 text-pf-muted">Daily PnL</td>
                    <td className="py-2 text-right font-mono tabular-nums">{fmtINR(optMetrics.dailyPnl)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{manualDirty ? fmtINR(manMetrics.dailyPnl) : fmtINR(optMetrics.dailyPnl)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{manualDirty ? deltaCell(manMetrics.dailyPnl, optMetrics.dailyPnl, true) : '—'}</td>
                  </tr>
                  <tr className="border-t border-pf-border/50">
                    <td className="py-2 text-pf-muted">MaxDD</td>
                    <td className="py-2 text-right font-mono tabular-nums">{fmtINR(optMetrics.maxDd)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{manualDirty ? fmtINR(manMetrics.maxDd) : fmtINR(optMetrics.maxDd)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{manualDirty ? deltaCell(manMetrics.maxDd, optMetrics.maxDd, true) : '—'}</td>
                  </tr>
                  <tr className="border-t border-pf-border/50">
                    <td className="py-2 text-pf-muted">Calmar</td>
                    <td className="py-2 text-right font-mono tabular-nums">{fmtNum(optMetrics.calmar, 4)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{manualDirty ? fmtNum(manMetrics.calmar, 4) : fmtNum(optMetrics.calmar, 4)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{manualDirty ? deltaCell(manMetrics.calmar, optMetrics.calmar) : '—'}</td>
                  </tr>
                  <tr className="border-t border-pf-border/50">
                    <td className="py-2 text-pf-muted">Exposure %</td>
                    <td className="py-2 text-right font-mono tabular-nums">{fmtNum(optMetrics.exposure, 1)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{manualDirty ? fmtNum(manMetrics.exposure, 1) : fmtNum(optMetrics.exposure, 1)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{manualDirty ? deltaCell(manMetrics.exposure, optMetrics.exposure) : '—'}</td>
                  </tr>
                  <tr className="border-t border-pf-border/50">
                    <td className="py-2 text-pf-muted">Total lots</td>
                    <td className="py-2 text-right font-mono tabular-nums">{optMetrics.lots}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{manualDirty ? manMetrics.lots : optMetrics.lots}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{manualDirty ? deltaCell(manMetrics.lots, optMetrics.lots) : '—'}</td>
                  </tr>
                </tbody>
              </table>

              <h3 className="text-[0.65rem] font-semibold uppercase tracking-wide text-pf-muted pt-2">Lots</h3>
              <table className="w-full text-[0.72rem]">
                <thead>
                  <tr className="text-pf-muted uppercase text-[0.62rem]">
                    <th className="text-left py-2">Strategy</th>
                    <th className="text-right py-2">Current</th>
                    <th className="text-right py-2">Rec</th>
                    <th className="text-right py-2">Manual</th>
                  </tr>
                </thead>
                <tbody>
                  {strategies.map((s) => {
                    const manLot = manualLots[s.strategy_id] ?? s.recommended_lots ?? 0;
                    const differs = Number(manLot) !== Number(s.recommended_lots ?? 0);
                    return (
                      <tr key={s.strategy_id} className="border-t border-pf-border/50">
                        <td className="py-2 font-mono">{cleanStrategyName(s.strategy_id)}</td>
                        <td className="py-2 text-right font-mono tabular-nums">{s.current_lots}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-pf-accent">{s.recommended_lots}</td>
                        <td className={`py-2 text-right font-mono tabular-nums ${differs ? 'text-pf-accent font-semibold' : ''}`}>
                          {manLot}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PortfolioPage;
