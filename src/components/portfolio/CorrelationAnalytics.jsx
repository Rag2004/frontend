import { AlertTriangle, Link2 } from 'lucide-react';
import { Badge } from '../ui';
import { Skeleton } from '../ui/Skeleton';
import { CorrelationHeatmap } from '../CorrelationHeatmap';
import { cleanStrategyName } from './utils/formatters';

function PairSummary({ label, pair, warn }) {
  if (!pair?.a || !pair?.b) {
    return (
      <div className="text-[var(--pf-meta-size)] text-pf-muted">
        <span className="font-semibold uppercase tracking-wider">{label}</span>
        <div className="mt-1">—</div>
      </div>
    );
  }
  const rho = Number(pair.rho);
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--pf-meta-size)] font-semibold uppercase tracking-wider text-pf-muted">{label}</span>
        {warn && <AlertTriangle className="h-3.5 w-3.5 text-pf-warning" aria-hidden />}
      </div>
      <div className="mt-1 font-mono text-[var(--pf-body-size)] text-pf-text truncate" title={`${pair.a} × ${pair.b}`}>
        {cleanStrategyName(pair.a)} × {cleanStrategyName(pair.b)}
      </div>
      <div className={`mt-0.5 font-mono text-sm tabular-nums ${rho > 0.85 ? 'text-pf-danger' : rho < 0.2 ? 'text-pf-success' : 'text-pf-text'}`}>
        ρ = {rho.toFixed(3)}
      </div>
    </div>
  );
}

export function CorrelationAnalytics({
  loading,
  snapshot,
  heatmapWeights,
  insights = {},
}) {
  if (loading && !snapshot) {
    return (
      <div className="pf-inst-card p-4 h-full">
        <Skeleton className="h-4 w-40 mb-4" />
        <Skeleton className="h-20 w-full mb-4" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const highPairs = insights.high_correlation_pairs || [];
  const highCount = highPairs.length;
  const avgRho = snapshot?.avg_pairwise_correlation;

  return (
    <div className="pf-inst-card p-4 h-full flex flex-col gap-3" role="region" aria-label="Correlation analytics">
      <div className="flex items-center justify-between gap-2">
        <h2 className="pf-inst-section-title flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          Correlation Analytics
        </h2>
        <span className="text-[var(--pf-meta-size)] text-pf-muted font-mono">
          {snapshot?.n_days || 0}d · {snapshot?.strategy_ids?.length || 0} strategies
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg border border-pf-border bg-black/15">
        <PairSummary label="Highest pair" pair={insights.highest_pair} warn={insights.highest_pair?.rho > 0.85} />
        <PairSummary label="Lowest pair" pair={insights.lowest_pair} />
        <div>
          <div className="text-[var(--pf-meta-size)] font-semibold uppercase tracking-wider text-pf-muted">Portfolio ρ</div>
          <div className="mt-1 font-mono text-lg tabular-nums text-pf-text">{avgRho ?? '—'}</div>
          {snapshot?.portfolio_health?.correlation_label && (
            <Badge variant="default" className="mt-1">{snapshot.portfolio_health.correlation_label}</Badge>
          )}
        </div>
      </div>

      {highCount > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="warning">{highCount} pair{highCount === 1 ? '' : 's'} above 0.85</Badge>
          {(insights.diversification_opportunities || []).slice(0, 2).map((p) => (
            <Badge key={`${p.a}-${p.b}`} variant="success">
              Diversify: {cleanStrategyName(p.a)} / {cleanStrategyName(p.b)} ({Number(p.rho).toFixed(2)})
            </Badge>
          ))}
        </div>
      )}

      <div className="pf-heat-panel flex-1 min-h-0">
        <CorrelationHeatmap
          strategyIds={snapshot?.strategy_ids || []}
          matrix={snapshot?.correlation || []}
          weights={heatmapWeights}
          strategyMeta={snapshot?.strategy_meta || {}}
          muted
        />
      </div>
    </div>
  );
}
