import { cleanStrategyName } from './formatters';

export function exportAllocationCsv(strategies, snapshot) {
  const header = 'strategy_id,symbol,weight_pct,sharpe,max_drawdown,current_lots,recommended_lots,delta_lots,data_source';
  const rows = (strategies || []).map((s) => [
    s.strategy_id,
    s.symbol || '',
    s.weight_pct ?? '',
    s.sharpe ?? '',
    s.max_drawdown ?? '',
    s.current_lots ?? 0,
    s.recommended_lots ?? 0,
    s.delta_lots ?? 0,
    s.data_source || '',
  ].join(','));
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `portfolio_allocation_${snapshot?.updated_at?.slice(0, 10) || 'export'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function saveDraft(settings, strategies) {
  const key = 'portfolio_draft';
  const payload = {
    saved_at: new Date().toISOString(),
    settings,
    allocations: Object.fromEntries(
      (strategies || []).map((s) => [s.strategy_id, s.recommended_lots])
    ),
  };
  localStorage.setItem(key, JSON.stringify(payload));
  return payload;
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem('portfolio_draft');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function draftSummary(strategies) {
  const changes = (strategies || []).filter((s) => s.delta_lots !== 0);
  return {
    count: changes.length,
    lines: changes.map((s) => `${cleanStrategyName(s.strategy_id)}: ${s.current_lots} → ${s.recommended_lots}`),
  };
}
