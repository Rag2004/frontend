import { Badge } from '../ui';
import { Skeleton } from '../ui/Skeleton';
import { healthBadgeVariant } from './utils/riskColors';

function HealthRow({ label, value, badge }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-pf-border/60 last:border-0">
      <div className="min-w-0">
        <div className="text-[var(--pf-body-size)] text-pf-text">{label}</div>
        {value != null && (
          <div className="text-[var(--pf-meta-size)] text-pf-muted font-mono tabular-nums">{value}</div>
        )}
      </div>
      {badge && <Badge variant={healthBadgeVariant(badge)}>{badge}</Badge>}
    </div>
  );
}

export function PortfolioHealthPanel({ health, loading }) {
  if (loading) {
    return (
      <div className="pf-inst-card p-4 h-full">
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const h = health || {};
  return (
    <div className="pf-inst-card p-4 h-full" role="region" aria-label="Portfolio health">
      <h2 className="pf-inst-section-title mb-3">Portfolio Health</h2>
      <HealthRow label="Diversification" badge={h.diversification_label} value={h.diversification_score != null ? `Score ${h.diversification_score}` : null} />
      <HealthRow label="Concentration" badge={h.concentration_label} value={h.concentration_score != null ? `Score ${h.concentration_score}` : null} />
      <HealthRow label="Correlation Risk" badge={h.correlation_label} value={h.correlation_risk_score != null ? `ρ ${h.correlation_risk_score}` : null} />
      <HealthRow label="Deployment" value={`${h.deployment_pct ?? '—'}%`} />
      <HealthRow label="Exposure" value={`${h.exposure_pct ?? '—'}%`} />
    </div>
  );
}
