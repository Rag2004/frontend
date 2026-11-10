import { Select } from '../ui';
import { fmtINR } from './utils/formatters';

const SOURCES = [
  { id: 'live', label: 'Live' },
  { id: 'backtest', label: 'Backtest CSV' },
];

const PRESETS = [
  { id: 'max_sharpe', label: 'Max Sharpe' },
  { id: 'max_calmar', label: 'Max Calmar' },
];

const PRESET_IDS = new Set(PRESETS.map((p) => p.id));

/** Map removed/unknown presets (e.g. legacy kelly) to a valid UI option. */
export function resolveOptimizerPreset(preset) {
  const p = (preset || 'max_sharpe').toLowerCase();
  return PRESET_IDS.has(p) ? p : 'max_sharpe';
}

export function OptimizerControlCenter({
  source,
  setSource,
  preset,
  setPreset,
  utilization,
  setUtilization,
  maxWeight,
  setMaxWeight,
  minWeight,
  setMinWeight,
  capital,
  setCapital,
  pm,
  baseline,
  deployable,
  aggregateRisk,
  health,
}) {
  const safePreset = resolveOptimizerPreset(preset);

  return (
    <div className="pf-inst-card p-4 h-full" role="region" aria-label="Optimizer settings">
      <h2 className="pf-inst-section-title mb-3">Portfolio Optimization Settings</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <div className="text-[var(--pf-meta-size)] text-pf-muted mb-1">Data source</div>
            <div className="pnl-env-seg" role="group">
              {SOURCES.map((s) => (
                <button key={s.id} type="button" className={source === s.id ? 'active' : ''} onClick={() => setSource(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-[var(--pf-meta-size)] text-pf-muted">Optimizer</span>
            <Select
              className="mt-1 w-full"
              value={safePreset}
              onChange={(e) => setPreset(resolveOptimizerPreset(e.target.value))}
            >
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className="text-[var(--pf-meta-size)] text-pf-muted">Utilization {Math.round(utilization * 100)}%</span>
            <input type="range" min="0.5" max="1" step="0.05" value={utilization} onChange={(e) => setUtilization(parseFloat(e.target.value))} className="w-full mt-1 accent-[var(--pf-accent)]" />
          </label>
          <div className="flex gap-3">
            <label className="block flex-1">
              <span className="text-[var(--pf-meta-size)] text-pf-muted">Min weight</span>
              <input
                type="number"
                min="0"
                max="0.5"
                step="0.01"
                className="mt-1 w-full rounded border border-pf-border bg-black/20 px-2 py-1.5 text-sm font-mono"
                value={minWeight}
                onChange={(e) => setMinWeight(Math.max(0, parseFloat(e.target.value) || 0))}
                title="Floor weight for every strategy with data (ensures ≥1 lot when capital allows)"
              />
            </label>
            <label className="block flex-1">
              <span className="text-[var(--pf-meta-size)] text-pf-muted">Max weight</span>
              <input
                type="number"
                min="0.1"
                max="1"
                step="0.05"
                className="mt-1 w-full rounded border border-pf-border bg-black/20 px-2 py-1.5 text-sm font-mono"
                value={maxWeight}
                onChange={(e) => setMaxWeight(parseFloat(e.target.value) || 0.25)}
              />
            </label>
          </div>
          <label className="block">
            <span className="text-[var(--pf-meta-size)] text-pf-muted">Capital</span>
            <input
              type="number"
              min={0}
              step={100000}
              className="mt-1 w-full rounded border border-pf-border bg-black/20 px-2 py-1.5 text-sm font-mono"
              value={capital}
              onChange={(e) => setCapital(e.target.value)}
              aria-label="Portfolio capital"
            />
          </label>
        </div>
        <div className="rounded-lg border border-pf-border bg-black/15 p-3">
          <div className="pf-inst-section-title mb-2">Expected Outcome</div>
          <div className="space-y-2 text-[var(--pf-body-size)]">
            <div className="flex justify-between"><span className="text-pf-muted">Sharpe{pm.portfolio_sharpe_deployed != null ? ' (deployed)' : ''}</span><span className="font-mono text-pf-text">{pm.portfolio_sharpe_deployed ?? pm.portfolio_sharpe ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-pf-muted">Calmar</span><span className="font-mono text-pf-text">{pm.portfolio_calmar_deployed ?? pm.portfolio_calmar ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-pf-muted">Volatility{pm.portfolio_volatility_deployed != null ? ' (deployed)' : ''}</span><span className="font-mono text-pf-text">{fmtINR(pm.portfolio_volatility_deployed ?? pm.portfolio_volatility)}</span></div>
            <div className="flex justify-between"><span className="text-pf-muted">Daily PnL{pm.expected_daily_pnl_deployed != null ? ' (deployed)' : ''}</span><span className="font-mono text-pf-text">{fmtINR(pm.expected_daily_pnl_deployed ?? pm.expected_daily_pnl)}</span></div>
            <div className="flex justify-between"><span className="text-pf-muted">Total PnL{pm.total_pnl_deployed != null ? ' (deployed)' : ''}</span><span className="font-mono text-pf-text">{fmtINR(pm.total_pnl_deployed ?? pm.total_pnl)}</span></div>
            <div className="flex justify-between"><span className="text-pf-muted">Max Drawdown</span><span className="font-mono text-pf-text" title="Worst peak-to-trough on recommended-lots equity path">{fmtINR(aggregateRisk)}</span></div>
            <div className="flex justify-between"><span className="text-pf-muted">Deployable</span><span className="font-mono text-pf-accent">{fmtINR(deployable)}</span></div>
            <div className="flex justify-between"><span className="text-pf-muted">Exposure</span><span className="font-mono">{health.exposure_pct ?? '—'}%</span></div>
            {baseline.portfolio_sharpe != null && (
              <div className="pt-2 mt-2 border-t border-pf-border text-[var(--pf-meta-size)] text-pf-muted">
                Current portfolio Sharpe: {baseline.portfolio_sharpe}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
