export function SymbolScopeBar({ value, onChange, symbols = [], loading = false, strategiesInScope }) {
  const options = [{ id: 'ALL', label: 'All together' }, ...symbols.map((s) => ({ id: s, label: s }))];

  return (
    <div className="pf-inst-card px-4 py-3 flex flex-wrap items-center justify-between gap-3" role="region" aria-label="Symbol scope">
      <div>
        <div className="pf-inst-section-title mb-1.5">Symbol scope</div>
        <div className="pnl-env-seg" role="group" aria-label="Select symbol scope">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={value === opt.id ? 'active' : ''}
              disabled={loading}
              onClick={() => onChange(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {value !== 'ALL' && strategiesInScope != null && (
        <span className="text-[var(--pf-meta-size)] text-pf-muted font-mono">
          Scope: {value} · {strategiesInScope} strateg{strategiesInScope === 1 ? 'y' : 'ies'}
        </span>
      )}
    </div>
  );
}
