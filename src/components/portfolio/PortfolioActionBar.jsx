import { Button } from '../ui';

export function PortfolioActionBar({
  changesCount,
  sharpeDelta,
  volDelta,
  scopeLabel,
  onSaveDraft,
  onExport,
  onCompare,
  onApply,
  visible,
}) {
  if (!visible) return null;

  const scopePrefix = scopeLabel ? `${scopeLabel}: ` : '';

  return (
    <div className="pf-inst-action-bar" role="region" aria-label="Portfolio actions">
      <div className="text-sm text-pf-text">
        <span className="font-medium">
          {scopePrefix}{changesCount} strateg{changesCount === 1 ? 'y' : 'ies'} modified
        </span>
        {sharpeDelta && <span className="ml-3 text-pf-success">Sharpe {sharpeDelta}</span>}
        {volDelta && <span className="ml-3 text-pf-muted">Vol {volDelta}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onSaveDraft}>Save Draft</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onExport}>Export</Button>
        <Button type="button" variant="default" size="sm" onClick={onCompare}>Compare</Button>
        <Button type="button" variant="primary" size="sm" onClick={onApply}>Apply Portfolio</Button>
      </div>
    </div>
  );
}
