import { PieChart, RefreshCw } from 'lucide-react';
import { Badge, Button } from '../ui';

export function PortfolioHeader({ preset, updatedAt, loading, onRecalculate, csvSpan }) {
  const csvLabel = csvSpan?.date_from && csvSpan?.date_to
    ? `CSV ${csvSpan.date_from} → ${csvSpan.date_to}${csvSpan.row_count != null ? ` · ${csvSpan.row_count} rows` : ''}`
    : null;

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-pf-border">
      <div>
        <h1 className="flex items-center gap-2 text-[var(--pf-title-size)] font-semibold text-pf-text">
          <PieChart className="h-5 w-5 text-pf-accent" aria-hidden />
          Portfolio Builder
        </h1>
        <p className="mt-1 text-[var(--pf-meta-size)] text-pf-muted">
          Institutional portfolio optimization · advisory lot sizing
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {csvLabel && (
          <Badge variant="default" title="Union date span of uploaded backtest CSV files">
            {csvLabel}
          </Badge>
        )}
        {updatedAt && (
          <Badge variant="default">{updatedAt.slice(11, 19)} UTC</Badge>
        )}
        <Badge variant="accent">{preset}</Badge>
        <Button type="button" variant="primary" size="sm" disabled={loading} onClick={onRecalculate}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Recalculate
        </Button>
      </div>
    </header>
  );
}
