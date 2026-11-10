import { DeskTooltip } from '../ui';

export const REGIMES = [
  { id: 'bullish', label: 'Bullish', tone: 'text-pf-success' },
  { id: 'neutral', label: 'Neutral', tone: 'text-pf-muted' },
  { id: 'bearish', label: 'Bearish', tone: 'text-pf-danger' },
];

export const VOLATILITY_BUCKETS = [
  { id: 'low', label: 'Low vol' },
  { id: 'medium', label: 'Medium vol' },
  { id: 'high', label: 'High vol' },
];

export function fmtBeta(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(2);
}

export function flattenBetaMatrix(matrix = {}) {
  return REGIMES.flatMap((regime) => (
    VOLATILITY_BUCKETS.map((volatility) => ({
      regime: regime.id,
      regimeLabel: regime.label,
      volatility: volatility.id,
      volatilityLabel: volatility.label,
      ...(matrix?.[regime.id]?.[volatility.id] || {}),
    }))
  ));
}

function heatStyle(beta, maxAbs) {
  if (beta == null || !Number.isFinite(Number(beta)) || maxAbs < 1e-12) return undefined;
  const value = Number(beta);
  const intensity = Math.min(Math.abs(value) / maxAbs, 1);
  const alpha = 0.06 + intensity * 0.22;
  if (value > 0) return { backgroundColor: `rgba(34, 197, 94, ${alpha})` };
  if (value < 0) return { backgroundColor: `rgba(239, 68, 68, ${alpha})` };
  return undefined;
}

function cellTooltip({ regimeLabel, volatilityLabel, beta, days, coverage_pct, portfolio }) {
  return (
    <div className="space-y-0.5 leading-tight">
      <div>{regimeLabel} · {volatilityLabel}</div>
      <div>β {fmtBeta(beta)}</div>
      <div>{days || 0} observation day{(days || 0) === 1 ? '' : 's'}</div>
      {portfolio && coverage_pct != null && (
        <div>{Number(coverage_pct).toFixed(1)}% capital coverage</div>
      )}
    </div>
  );
}

export function RegimeBetaMatrix({
  matrix = {},
  portfolio = false,
  ariaLabel = 'Regime volatility beta matrix',
}) {
  const cells = flattenBetaMatrix(matrix);
  const available = cells.filter((cell) => cell.beta != null && Number.isFinite(Number(cell.beta)));
  const maxAbs = available.reduce((max, cell) => Math.max(max, Math.abs(Number(cell.beta))), 0);
  const strongest = [...available]
    .sort((a, b) => Math.abs(Number(b.beta)) - Math.abs(Number(a.beta)))[0];
  const strongestKey = strongest ? `${strongest.regime}:${strongest.volatility}` : '';

  return (
    <div className="overflow-auto rounded-md border border-pf-border">
      <table className="w-full min-w-[420px] border-collapse text-[var(--pf-body-size)]" aria-label={ariaLabel}>
        <thead>
          <tr className="bg-black/25">
            <th className="border border-pf-border px-2 py-1.5 text-left text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-pf-muted">
              Regime
            </th>
            {VOLATILITY_BUCKETS.map((volatility) => (
              <th
                key={volatility.id}
                className="border border-pf-border px-2 py-1.5 text-right text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-pf-muted"
              >
                {volatility.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {REGIMES.map((regime) => (
            <tr key={regime.id}>
              <th className={`border border-pf-border bg-black/15 px-2 py-1.5 text-left text-[0.64rem] font-semibold uppercase tracking-wider ${regime.tone}`}>
                {regime.label}
              </th>
              {VOLATILITY_BUCKETS.map((volatility) => {
                const cell = matrix?.[regime.id]?.[volatility.id] || {};
                const hasBeta = cell.beta != null && Number.isFinite(Number(cell.beta));
                const isStrongest = strongestKey === `${regime.id}:${volatility.id}`;
                const tooltip = cellTooltip({
                  regimeLabel: regime.label,
                  volatilityLabel: volatility.label,
                  beta: cell.beta,
                  days: cell.days,
                  coverage_pct: cell.coverage_pct,
                  portfolio,
                });

                const cellBody = (
                  <span
                    className={`block h-full w-full cursor-default px-2 py-1.5 text-right transition-colors hover:brightness-125 ${
                      isStrongest ? 'outline outline-1 outline-offset-[-1px] outline-pf-accent/70' : ''
                    } ${!hasBeta ? 'text-pf-muted' : ''}`}
                    style={hasBeta ? heatStyle(cell.beta, maxAbs) : undefined}
                  >
                    <span className={`font-mono text-[0.82rem] tabular-nums ${hasBeta ? 'font-semibold text-pf-text' : 'text-pf-muted'}`}>
                      {fmtBeta(cell.beta)}
                    </span>
                  </span>
                );

                return (
                  <td key={volatility.id} className="border border-pf-border p-0 align-middle">
                    {hasBeta ? (
                      <DeskTooltip label={tooltip} side="top">
                        <button type="button" className="block w-full appearance-none border-0 bg-transparent p-0 text-left">
                          {cellBody}
                        </button>
                      </DeskTooltip>
                    ) : (
                      cellBody
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default RegimeBetaMatrix;
