import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Skeleton } from '../ui/Skeleton';
import { fmtINR } from './utils/formatters';

function Chip({ label, value, tone, sub }) {
  const toneClass =
    tone === 'pos' ? 'text-emerald-400' : tone === 'neg' ? 'text-rose-400' : 'text-pf-text';
  return (
    <div className="flex flex-col gap-0.5 min-w-[7rem]">
      <span className="text-[0.62rem] uppercase tracking-wide text-pf-muted">{label}</span>
      <span className={`font-mono tabular-nums text-sm ${toneClass}`}>{value}</span>
      {sub ? <span className="text-[0.6rem] text-pf-muted">{sub}</span> : null}
    </div>
  );
}

function tipFormatter(value, name) {
  const labels = {
    equity: 'Rec equity',
    drawdown_depth: 'Drawdown depth',
    manual_equity: 'Manual equity',
    daily_pnl: 'Daily PnL',
  };
  if (name === 'drawdown_depth') {
    return [fmtINR(-(Number(value) || 0)), labels[name]];
  }
  return [fmtINR(value), labels[name] || name];
}

function axisFmt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(Math.round(n));
}

export function EquityCurveChart({
  equityCurve,
  manualEquityCurve,
  pathMaxDrawdown,
  totalLots,
  loading = false,
}) {
  const points = equityCurve?.points || [];
  const manualPoints = manualEquityCurve?.points || [];

  const chartData = useMemo(() => {
    if (!points.length) return [];
    const manualByDate = new Map(manualPoints.map((p) => [p.date, p]));
    // API already compresses to active PnL / present days — plot densely, no gap nulls.
    return points.map((p) => {
      const dd = Number(p.drawdown);
      const man = manualByDate.get(p.date);
      return {
        date: p.date,
        equity: p.equity,
        drawdown_depth: Number.isFinite(dd) ? Math.max(0, -dd) : 0,
        daily_pnl: p.daily_pnl,
        manual_equity: man != null ? man.equity : undefined,
      };
    });
  }, [points, manualPoints]);

  const showManual = manualPoints.length > 0;

  const maxDd = useMemo(() => {
    const fromPoints = points.reduce((m, p) => {
      const d = Number(p.drawdown);
      return Number.isFinite(d) ? Math.min(m, d) : m;
    }, 0);
    const candidates = [equityCurve?.max_drawdown, pathMaxDrawdown, fromPoints]
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v));
    if (!candidates.length) return null;
    // Most negative path drawdown across all sources.
    return candidates.reduce((a, b) => Math.min(a, b), 0);
  }, [equityCurve?.max_drawdown, pathMaxDrawdown, points]);

  const totalPnl = equityCurve?.total_pnl ?? (points.length ? points[points.length - 1].equity : null);
  const dateFrom = points[0]?.date;
  const dateTo = points.length ? points[points.length - 1].date : null;
  const rangeLabel = dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : '—';
  const noDrawdown = maxDd != null && Math.abs(maxDd) < 1e-9;

  return (
    <div className="pf-inst-card p-4" role="region" aria-label="Recommended lots equity curve">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="pf-inst-section-title">Equity curve — Recommended lots</h2>
          <p className="text-[var(--pf-meta-size)] text-pf-muted mt-0.5">
            Cumulative PnL and path drawdown on CSV union dates (1-lot rows × Rec lots)
            {showManual ? ' · dashed = Manual' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <Chip
            label="Total PnL"
            value={fmtINR(totalPnl)}
            tone={totalPnl == null ? null : totalPnl >= 0 ? 'pos' : 'neg'}
          />
          <Chip
            label="Max DD (path)"
            value={fmtINR(maxDd)}
            tone={maxDd == null || noDrawdown ? null : 'neg'}
            sub={noDrawdown ? 'No day below prior peak' : null}
          />
          <Chip label="Date range" value={rangeLabel} />
          <Chip label="Rec lots" value={totalLots != null ? String(totalLots) : '—'} />
        </div>
      </div>

      {loading && !chartData.length ? (
        <Skeleton className="h-[240px] w-full" />
      ) : chartData.length ? (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="pfEquityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(56,189,248,0.32)" />
                  <stop offset="100%" stopColor="rgba(56,189,248,0.02)" />
                </linearGradient>
                <linearGradient id="pfDdFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(244,63,94,0.35)" />
                  <stop offset="100%" stopColor="rgba(244,63,94,0.02)" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'rgba(148,163,184,0.75)', fontSize: 10 }}
                tickFormatter={(d) => (typeof d === 'string' && d.length >= 10 ? d.slice(5, 10) : d)}
                minTickGap={28}
              />
              <YAxis
                yAxisId="equity"
                tick={{ fill: 'rgba(148,163,184,0.75)', fontSize: 10 }}
                tickFormatter={axisFmt}
                width={52}
              />
              <YAxis
                yAxisId="dd"
                orientation="right"
                tick={{ fill: 'rgba(244,63,94,0.75)', fontSize: 10 }}
                tickFormatter={axisFmt}
                width={44}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15,23,42,0.95)',
                  border: '1px solid rgba(148,163,184,0.25)',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'rgba(148,163,184,0.9)' }}
                formatter={tipFormatter}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: 'rgba(148,163,184,0.85)' }}
                formatter={(value) =>
                  ({
                    equity: 'Rec equity',
                    drawdown_depth: 'Drawdown depth',
                    manual_equity: 'Manual equity',
                  }[value] || value)
                }
              />
              <ReferenceLine yAxisId="equity" y={0} stroke="rgba(148,163,184,0.3)" />
              <Area
                yAxisId="equity"
                type="linear"
                dataKey="equity"
                stroke="rgba(56,189,248,0.95)"
                strokeWidth={2}
                fill="url(#pfEquityFill)"
                connectNulls={false}
                isAnimationActive={false}
              />
              <Area
                yAxisId="dd"
                type="linear"
                dataKey="drawdown_depth"
                stroke="rgba(244,63,94,0.85)"
                strokeWidth={1.5}
                fill="url(#pfDdFill)"
                connectNulls={false}
                isAnimationActive={false}
              />
              {showManual && (
                <Line
                  yAxisId="equity"
                  type="linear"
                  dataKey="manual_equity"
                  stroke="rgba(251,191,36,0.95)"
                  strokeWidth={1.75}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[160px] flex items-center justify-center text-[var(--pf-meta-size)] text-pf-muted">
          Upload strategy CSVs and run optimize to see the recommended-lots equity path.
        </div>
      )}
    </div>
  );
}
