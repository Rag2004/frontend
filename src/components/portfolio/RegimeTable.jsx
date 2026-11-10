import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Search, Upload } from 'lucide-react';
import { Badge, Button, Input, Select } from '../ui';
import { cleanStrategyName, fmtINR } from './utils/formatters';
import {
  flattenBetaMatrix,
  fmtBeta,
  REGIMES,
  RegimeBetaMatrix,
} from './RegimeBetaMatrix';

function matrixProfile(matrix = {}) {
  const cells = flattenBetaMatrix(matrix);
  const available = cells.filter((cell) => cell.beta != null && Number.isFinite(Number(cell.beta)));
  const strongest = [...available]
    .sort((a, b) => Math.abs(Number(b.beta)) - Math.abs(Number(a.beta)))[0] || null;
  const observationDays = cells
    .map((cell) => Number(cell.days) || 0)
    .filter((days) => days > 0);
  return {
    strongest,
    availableCells: available.length,
    observationMin: observationDays.length ? Math.min(...observationDays) : 0,
    observationMax: observationDays.length ? Math.max(...observationDays) : 0,
  };
}

function RegimePnlSummary({ regimes = {} }) {
  return (
    <div className="overflow-hidden rounded-md border border-pf-border">
      <table className="w-full border-collapse text-[var(--pf-body-size)]">
        <thead>
          <tr className="bg-black/25">
            {REGIMES.map((regime) => (
              <th
                key={regime.id}
                className={`border border-pf-border px-2 py-1.5 text-left text-[0.58rem] font-semibold uppercase tracking-[0.1em] ${regime.tone}`}
              >
                {regime.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {REGIMES.map((regime) => {
              const bucket = regimes?.[regime.id] || {};
              const avg = Number(bucket.avg_pnl) || 0;
              const pnlTone = avg > 0 ? 'text-pf-success' : avg < 0 ? 'text-pf-danger' : 'text-pf-text';
              return (
                <td key={regime.id} className="border border-pf-border bg-black/10 px-2 py-1.5 align-top">
                  <div className={`font-mono text-[0.76rem] font-semibold tabular-nums ${pnlTone}`}>{fmtINR(avg)} / day</div>
                  <div className="mt-0.5 text-[0.52rem] text-pf-muted">
                    {fmtINR(bucket.total_pnl || 0)} total · {bucket.days || 0}d
                  </div>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function RegimeTable({
  strategies = [],
  regimeMetrics = {},
  regimeConfig = {},
  onSpotUpload,
  spotBusy = false,
}) {
  const spotRef = useRef(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('extreme');
  const [selectedId, setSelectedId] = useState('');

  const threshold = regimeConfig.threshold_pct ?? 0.4;
  const volLow = regimeConfig.vol_low_pct ?? 0.6;
  const volHigh = regimeConfig.vol_high_pct ?? 1;
  const missing = regimeConfig.missing_spot_indices || [];
  const hasSpot = regimeConfig.has_spot_data;
  const hasCompleteOhlc = regimeConfig.has_complete_ohlc;

  const rows = useMemo(
    () => strategies
      .filter((strategy) => strategy.regime)
      .map((strategy) => ({ ...strategy, betaProfile: matrixProfile(strategy.regime.beta_matrix) })),
    [strategies],
  );

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? rows.filter((strategy) => (
        strategy.strategy_id.toLowerCase().includes(query)
        || cleanStrategyName(strategy.strategy_id).toLowerCase().includes(query)
      ))
      : [...rows];
    filtered.sort((a, b) => {
      if (sortBy === 'name') return cleanStrategyName(a.strategy_id).localeCompare(cleanStrategyName(b.strategy_id));
      if (sortBy === 'overall') return Math.abs(Number(b.regime.beta) || 0) - Math.abs(Number(a.regime.beta) || 0);
      return Math.abs(Number(b.betaProfile.strongest?.beta) || 0) - Math.abs(Number(a.betaProfile.strongest?.beta) || 0);
    });
    return filtered;
  }, [rows, search, sortBy]);

  useEffect(() => {
    if (!visibleRows.length) {
      setSelectedId('');
      return;
    }
    if (!visibleRows.some((strategy) => strategy.strategy_id === selectedId)) {
      setSelectedId(visibleRows[0].strategy_id);
    }
  }, [selectedId, visibleRows]);

  const selected = visibleRows.find((strategy) => strategy.strategy_id === selectedId) || null;

  return (
    <section className="pf-inst-card overflow-hidden" aria-label="Spot and beta research workspace">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-pf-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="pf-inst-section-title">Spot and Beta Analysis</h2>
            <Badge variant="default">SENSEX</Badge>
            {hasSpot && (
              <span className="text-[0.56rem] text-pf-muted">
                {regimeConfig.spot_date_from || '—'} → {regimeConfig.spot_date_to || '—'} · {regimeConfig.spot_row_count || 0}d
              </span>
            )}
          </div>
          <p className="mt-1 text-[0.6rem] text-pf-muted">
            Regime ±{threshold}% · Range (High − Low) / Low · Volatility: ≤{volLow}% / {volLow}–{volHigh}% / ≥{volHigh}%
          </p>
        </div>
        <div>
          <input
            ref={spotRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={spotBusy}
            onChange={(event) => {
              onSpotUpload?.(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <Button type="button" variant="default" size="xs" disabled={spotBusy} onClick={() => spotRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> {spotBusy ? 'Uploading…' : 'Update spot'}
          </Button>
        </div>
      </header>

      {!hasSpot && (
        <div className="m-3 flex items-center gap-2 rounded-md border border-pf-warning/40 bg-pf-warning/10 px-3 py-2 text-[0.66rem] text-pf-warning" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>No SENSEX spot data. Upload <code>date,index,open,high,low,close</code>.</span>
        </div>
      )}
      {hasSpot && (!hasCompleteOhlc || missing.length > 0) && (
        <div className="m-3 flex items-center gap-2 rounded-md border border-pf-warning/40 bg-pf-warning/10 px-3 py-2 text-[0.66rem] text-pf-warning" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            SENSEX high/low data is incomplete
            {regimeConfig.missing_ohlc_rows ? ` for ${regimeConfig.missing_ohlc_rows} rows` : ''}; volatility cells exclude those days.
          </span>
        </div>
      )}

      <div className="border-b border-pf-border p-3">
        <div className="mb-1.5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-[0.64rem] font-semibold uppercase tracking-[0.1em] text-pf-accent">Portfolio beta · deployed</h3>
            <p className="mt-0.5 text-[0.52rem] text-pf-muted">βₚ,k = Σ wⱼβⱼ,k · lots × margin · hover cell for detail</p>
          </div>
          <div className="text-right">
            <div className="text-[0.5rem] font-semibold uppercase tracking-[0.1em] text-pf-muted">Overall β</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-pf-text">{fmtBeta(regimeMetrics.beta)}</div>
          </div>
        </div>
        <RegimeBetaMatrix matrix={regimeMetrics.beta_matrix} portfolio ariaLabel="Portfolio beta by regime and volatility" />
      </div>

      <div className="grid min-h-[440px] lg:grid-cols-[minmax(300px,0.78fr)_minmax(0,1.4fr)]">
        <div className="border-b border-pf-border lg:border-b-0 lg:border-r">
          <div className="sticky top-0 z-10 space-y-2 border-b border-pf-border bg-[var(--pf-card)] p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-pf-muted">Strategy explorer</h3>
              <span className="font-mono text-[0.54rem] text-pf-muted">{visibleRows.length}/{rows.length}</span>
            </div>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-pf-muted" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find strategy…"
                  className="h-8 pl-8 text-xs"
                  aria-label="Search strategies"
                />
              </div>
              <Select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-8 max-w-[132px] text-xs" aria-label="Sort strategies">
                <option value="extreme">Extreme β</option>
                <option value="overall">Overall β</option>
                <option value="name">Name</option>
              </Select>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_3.2rem] gap-2 px-1 text-[0.5rem] font-semibold uppercase tracking-[0.08em] text-pf-muted">
              <span>Strategy</span>
              <span className="text-right">Overall β</span>
              <span className="text-right">Cells</span>
            </div>
          </div>

          <div className="max-h-[500px] overflow-y-auto">
            {visibleRows.map((strategy) => {
              const active = strategy.strategy_id === selectedId;
              const strongest = strategy.betaProfile.strongest;
              return (
                <button
                  key={strategy.strategy_id}
                  type="button"
                  onClick={() => setSelectedId(strategy.strategy_id)}
                  className={`grid w-full grid-cols-[minmax(0,1fr)_4.5rem_3.2rem] items-center gap-2 border-b border-pf-border/50 px-3 py-1.5 text-left transition-colors ${
                    active
                      ? 'bg-pf-accent/12 ring-1 ring-inset ring-pf-accent/35'
                      : 'hover:bg-white/[0.06]'
                  }`}
                  aria-pressed={active}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[0.68rem] font-semibold text-pf-text">
                      {cleanStrategyName(strategy.strategy_id)}
                    </span>
                    <span className="mt-0.5 block truncate text-[0.5rem] text-pf-muted">
                      {strongest
                        ? `${strongest.regimeLabel} · ${strongest.volatilityLabel} · β ${fmtBeta(strongest.beta)}`
                        : 'No valid beta cells'}
                    </span>
                  </span>
                  <span className="text-right font-mono text-[0.72rem] font-semibold tabular-nums text-pf-text">
                    {fmtBeta(strategy.regime.beta)}
                  </span>
                  <span className="text-right font-mono text-[0.54rem] tabular-nums text-pf-muted">
                    {strategy.betaProfile.availableCells}/9
                  </span>
                </button>
              );
            })}
            {!visibleRows.length && (
              <div className="px-4 py-12 text-center text-xs text-pf-muted">
                {rows.length ? 'No strategies match this search.' : 'No strategy beta data is available.'}
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 p-3">
          {selected ? (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-pf-border pb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono text-sm font-semibold text-pf-text">{cleanStrategyName(selected.strategy_id)}</h3>
                    <Badge variant="default">{selected.regime.index || 'SENSEX'}</Badge>
                  </div>
                  <p className="mt-0.5 text-[0.54rem] text-pf-muted">
                    {selected.regime.classified_days || 0} classified · {selected.regime.unclassified_days || 0} unclassified days
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[0.5rem] font-semibold uppercase tracking-[0.1em] text-pf-muted">Overall beta</div>
                  <div className="font-mono text-lg font-semibold tabular-nums text-pf-text">{fmtBeta(selected.regime.beta)}</div>
                </div>
              </div>

              <RegimeBetaMatrix
                matrix={selected.regime.beta_matrix}
                ariaLabel={`${cleanStrategyName(selected.strategy_id)} beta by regime and volatility`}
              />

              <div>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <h4 className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-pf-muted">Regime P&amp;L context</h4>
                  <span className="text-[0.5rem] text-pf-muted">Average / day · total · observations</span>
                </div>
                <RegimePnlSummary regimes={selected.regime.regimes} />
              </div>
            </div>
          ) : (
            <div className="flex min-h-[320px] items-center justify-center text-xs text-pf-muted">
              Select a strategy to inspect its beta profile.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default RegimeTable;
