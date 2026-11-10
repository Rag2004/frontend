import { Hash, IndianRupee, Layers, Shield, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton';
import { fmtINR } from './utils/formatters';

const ICONS = [Wallet, Layers, TrendingUp, IndianRupee, TrendingDown, Hash];

export function PortfolioKpiStrip({ loading, items = [] }) {
  if (loading && !items.length) {
    return (
      <div className="pf-inst-grid-6" aria-label="Portfolio KPIs">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={`kpi-skel-${i}`} className="pf-inst-card p-3">
            <Skeleton className="h-3 w-16 mb-2" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className="pf-inst-grid-6" aria-label="Portfolio KPIs" role="region">
      {items.map((item, i) => {
        const Icon = ICONS[i] || Wallet;
        return (
          <div key={item.label} className="pf-inst-card p-3 flex gap-2.5 items-start">
            <div className="rounded-md border border-pf-border p-1.5 text-pf-accent shrink-0">
              <Icon className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="pf-inst-section-title">{item.label}</div>
              <div className={`pf-inst-kpi-value text-base xl:text-[var(--pf-kpi-size)] ${item.accent ? 'text-pf-accent' : ''} ${item.danger ? 'text-pf-danger' : ''}`}>
                {item.value}
              </div>
              {item.sub && (
                <div className="text-[var(--pf-meta-size)] text-pf-muted mt-0.5 truncate">{item.sub}</div>
              )}
              {item.delta && (
                <div className={`text-[var(--pf-meta-size)] mt-0.5 ${item.delta.startsWith('+') ? 'text-pf-success' : 'text-pf-danger'}`}>
                  {item.delta} vs current
                </div>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function buildKpiItems({
  capital,
  deployable,
  pm,
  utilization,
  sharpeDelta,
  totalPnlDeployed,
  totalDrawdownRec,
  totalLotsRec,
}) {
  return [
    { label: 'Capital', value: fmtINR(capital.capital_available), sub: capital.source || '—' },
    { label: 'Deployable', value: fmtINR(deployable), sub: `${Math.round((utilization || 0.8) * 100)}% utilized`, accent: true },
    { label: 'Port Sharpe', value: pm.portfolio_sharpe_deployed ?? pm.portfolio_sharpe ?? '—', delta: sharpeDelta, sub: 'At recommended lots' },
    {
      label: 'Total PnL',
      value: fmtINR(totalPnlDeployed ?? pm.total_pnl_deployed ?? pm.total_pnl),
      sub: 'At recommended lots',
    },
    {
      label: 'Total Drawdown',
      value: fmtINR(-(Number(totalDrawdownRec) || 0)),
      sub: 'Worst path DD (equity curve)',
      danger: true,
    },
    {
      label: 'Total lots',
      value: String(totalLotsRec ?? 0),
      sub: 'Assigned by portfolio builder',
      accent: true,
    },
  ];
}
