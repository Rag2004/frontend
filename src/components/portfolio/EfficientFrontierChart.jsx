import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { Skeleton } from '../ui/Skeleton';
import { fmtINR } from './utils/formatters';

const CLOUD_BUCKETS = 120;

function axisFmt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(Math.round(n));
}

function buildDomain(points, key) {
  const vals = (points || []).map((p) => Number(p?.[key])).filter(Number.isFinite);
  if (!vals.length) return ['auto', 'auto'];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (Math.abs(max - min) < 1e-9) {
    const pad = Math.max(Math.abs(max) * 0.1, 1);
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.08;
  return [Math.max(0, min - pad), max + pad];
}

function bucketize(points, xDomain, yDomain) {
  if (!points?.length) return [];
  const [xmin, xmax] = xDomain;
  const [ymin, ymax] = yDomain;
  const xr = Math.max((xmax || 0) - (xmin || 0), 1);
  const yr = Math.max((ymax || 0) - (ymin || 0), 1);
  const map = new Map();
  for (const p of points) {
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const bx = Math.round(((x - xmin) / xr) * CLOUD_BUCKETS);
    const by = Math.round(((y - ymin) / yr) * CLOUD_BUCKETS);
    const key = `${bx}:${by}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...p, count: 1 });
      continue;
    }
    map.set(key, {
      ...prev,
      count: prev.count + 1,
      x: (prev.x * prev.count + x) / (prev.count + 1),
      y: (prev.y * prev.count + y) / (prev.count + 1),
    });
  }
  return Array.from(map.values());
}

function tipContent({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded border border-[var(--pf-border)] bg-[var(--pf-card)] px-2 py-1.5 text-[0.7rem] shadow-lg">
      <div className="text-pf-muted">{d._kind === 'frontier' ? 'Frontier' : d._kind === 'optimal' ? 'Optimal' : 'Candidate'}</div>
      <div className="font-mono tabular-nums">Risk {fmtINR(d.x)} · Return {fmtINR(d.y)}</div>
      {d.count > 1 ? <div className="font-mono">Books {d.count}</div> : null}
      {d.sharpe != null && <div className="font-mono">Sharpe {Number(d.sharpe).toFixed(2)}</div>}
      {d.calmar != null && <div className="font-mono">Calmar {Number(d.calmar).toFixed(2)}</div>}
    </div>
  );
}

function DetailCard({ point, strategyIds, xLabel }) {
  if (!point) {
    return (
      <div className="text-[var(--pf-meta-size)] text-pf-muted">
        Click a point to inspect lot allocation and metrics.
      </div>
    );
  }
  const alloc = point.allocation || [];
  const weights = point.weights || [];
  return (
    <div className="space-y-2 text-[var(--pf-meta-size)]">
      <div className="flex flex-wrap gap-3 font-mono tabular-nums">
        <span>Return {fmtINR(point.y ?? point.expected_return)}</span>
        <span>{xLabel === 'max_drawdown' ? 'MaxDD' : 'Vol'} {fmtINR(point.x)}</span>
        <span>Sharpe {point.sharpe != null ? Number(point.sharpe).toFixed(2) : '—'}</span>
        <span>Calmar {point.calmar != null ? Number(point.calmar).toFixed(2) : '—'}</span>
        <span>MaxDD {fmtINR(point.max_drawdown)}</span>
      </div>
      {point.count > 1 ? (
        <div className="text-[var(--pf-meta-size)] text-pf-muted">
          {point.count} candidate books are represented by this grouped point.
        </div>
      ) : null}
      <div className="overflow-auto max-h-28">
        <table className="w-full text-left font-mono tabular-nums">
          <thead>
            <tr className="text-pf-muted">
              <th className="pr-2 font-normal">Strategy</th>
              <th className="pr-2 font-normal">Lots</th>
              <th className="font-normal">Weight</th>
            </tr>
          </thead>
          <tbody>
            {alloc.map((lots, i) => (
              <tr key={strategyIds?.[i] || i}>
                <td className="pr-2 truncate max-w-[8rem]">{strategyIds?.[i] || `#${i + 1}`}</td>
                <td className="pr-2">{lots}</td>
                <td>{weights[i] != null ? `${(Number(weights[i]) * 100).toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EfficientFrontierChart({
  frontier,
  strategyIds = [],
  loading = false,
  scopeLabel = 'ALL',
  lotsSource = null,
}) {
  const [selected, setSelected] = useState(null);

  const {
    candidates,
    frontierPts,
    optimal,
    xLabel,
    title,
    meta,
    message,
    domains,
  } = useMemo(() => {
    const ef = frontier || {};
    const xl = ef.x_label || 'volatility';
    const preset = ef.preset || 'max_sharpe';
    const allPts = [
      ...(ef.candidates || []),
      ...(ef.frontier || []),
      ...(ef.optimal ? [ef.optimal] : []),
    ];
    const xDomain = buildDomain(allPts, 'x');
    const yDomain = buildDomain(allPts, 'y');
    return {
      candidates: bucketize((ef.candidates || []).map((p) => ({ ...p, _kind: 'candidate' })), xDomain, yDomain),
      frontierPts: (ef.frontier || []).map((p) => ({ ...p, _kind: 'frontier' })),
      optimal: ef.optimal ? { ...ef.optimal, _kind: 'optimal' } : null,
      xLabel: xl,
      title: preset === 'max_calmar'
        ? 'Efficient Frontier (Return vs MaxDD)'
        : 'Efficient Frontier (Return vs Volatility)',
      meta: {
        totalLots: ef.total_lots,
        minLots: ef.min_lots,
        maxLots: ef.max_lots,
        n: ef.n_candidates,
        estimated: ef.estimated_candidates,
        evaluated: ef.evaluated_candidates,
        exact: ef.exact,
        truncated: ef.truncated,
      },
      message: ef.message,
      domains: { x: xDomain, y: yDomain },
    };
  }, [frontier]);

  const xAxisLabel = xLabel === 'max_drawdown' ? 'Path MaxDD (₹)' : 'Volatility (₹/day)';

  return (
    <div className="pf-inst-card p-4" role="region" aria-label="Efficient frontier">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div>
          <h2 className="pf-inst-section-title">{title}</h2>
          <div className="text-[var(--pf-meta-size)] text-pf-muted mt-1">
            Scope: {scopeLabel || 'ALL'}
            {lotsSource === 'frontier_optimal' ? ' · REC from Optimal' : ''}
            {' · Metrics at Rec lot scale (same as Expected Outcome / equity curve)'}
          </div>
        </div>
        <div className="text-[var(--pf-meta-size)] text-pf-muted font-mono tabular-nums text-right">
          {meta.n != null ? `${meta.n} books` : null}
          {meta.exact === false && meta.evaluated != null ? ` · eval ${meta.evaluated}` : null}
          {meta.totalLots != null ? ` · ${meta.totalLots} lots` : null}
          {meta.minLots != null && meta.maxLots != null
            ? ` · [${meta.minLots}–${meta.maxLots}] / strat`
            : null}
          {meta.exact === false ? ' · approx' : meta.truncated ? ' · truncated' : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-[var(--pf-meta-size)] text-pf-muted mb-3">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-slate-500 inline-block" /> Candidates</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-sky-400 inline-block" /> Frontier</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-400 inline-block" /> Optimal</span>
      </div>

      {loading ? (
        <Skeleton className="h-[400px] w-full" />
      ) : !candidates.length && !frontierPts.length ? (
        <div className="h-[200px] flex items-center justify-center text-pf-muted text-sm">
          {message || 'No discrete lot frontier for current constraints.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
          <div className="h-[400px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 20, bottom: 44, left: 20 }}>
                <CartesianGrid stroke="var(--pf-border)" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="risk"
                  domain={domains.x}
                  tickFormatter={axisFmt}
                  tick={{ fill: 'var(--pf-muted)', fontSize: 10 }}
                  label={{ value: xAxisLabel, position: 'insideBottom', offset: -24, fill: 'var(--pf-muted)', fontSize: 10 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="return"
                  domain={domains.y}
                  tickFormatter={axisFmt}
                  tick={{ fill: 'var(--pf-muted)', fontSize: 10 }}
                  label={{ value: 'Expected daily PnL (₹)', angle: -90, position: 'insideLeft', fill: 'var(--pf-muted)', fontSize: 10 }}
                />
                <ZAxis dataKey="count" range={[40, 180]} />
                <Tooltip content={tipContent} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter
                  name="Candidates"
                  data={candidates}
                  fill="#64748b"
                  fillOpacity={0.28}
                  onClick={(d) => setSelected(d?.payload || d)}
                >
                  {candidates.map((_, i) => (
                    <Cell key={`c-${i}`} cursor="pointer" />
                  ))}
                </Scatter>
                <Scatter
                  name="Frontier"
                  data={frontierPts}
                  fill="#38bdf8"
                  line={frontierPts.length > 1 ? { stroke: '#38bdf8', strokeWidth: 2 } : false}
                  lineType="joint"
                  onClick={(d) => setSelected(d?.payload || d)}
                >
                  {frontierPts.map((_, i) => (
                    <Cell key={`f-${i}`} cursor="pointer" />
                  ))}
                </Scatter>
                {optimal ? (
                  <Scatter
                    name="Optimal"
                    data={[optimal]}
                    fill="#f59e0b"
                    shape="star"
                    onClick={(d) => setSelected(d?.payload || d)}
                  />
                ) : null}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="border-t xl:border-t-0 xl:border-l border-[var(--pf-border)] pt-3 xl:pt-0 xl:pl-4 min-w-0">
            <div className="text-[0.62rem] uppercase tracking-wide text-pf-muted mb-2">Selection</div>
            {message ? (
              <div className="mb-3 rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[var(--pf-meta-size)] text-amber-300">
                {message}
              </div>
            ) : null}
            <DetailCard point={selected || optimal} strategyIds={strategyIds} xLabel={xLabel} />
          </div>
        </div>
      )}
    </div>
  );
}
