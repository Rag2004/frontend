import { Fragment, useMemo, useState } from 'react';
import { getStrategyDisplayName as cleanName } from '../lib/strategyDisplayNames';

function corrColor(rho, muted = false) {
  const v = Math.max(-1, Math.min(1, Number(rho) || 0));
  if (muted) {
    if (v >= 0) {
      const t = v;
      const r = Math.round(45 + t * 55);
      const g = Math.round(55 - t * 18);
      const b = Math.round(68 - t * 22);
      return `rgb(${r},${g},${b})`;
    }
    const t = -v;
    const r = Math.round(38 - t * 8);
    const g = Math.round(58 + t * 12);
    const b = Math.round(78 + t * 28);
    return `rgb(${r},${g},${b})`;
  }
  if (v >= 0) {
    const t = v;
    const r = Math.round(220 + t * 35);
    const g = Math.round(80 - t * 50);
    const b = Math.round(80 - t * 50);
    return `rgb(${r},${g},${b})`;
  }
  const t = -v;
  const r = Math.round(80 - t * 50);
  const g = Math.round(120 + t * 40);
  const b = Math.round(200 + t * 55);
  return `rgb(${r},${g},${b})`;
}

function CellTooltip({ rowId, colId, rowSym, colSym, rho, weightPct, isGroupEnd, muted, children }) {
  const [show, setShow] = useState(false);
  return (
    <div
      className={`pf-heat-cell ${isGroupEnd ? 'pf-heat-cell--group-end' : ''} ${muted ? 'pf-heat-cell--muted' : ''}`}
      style={{ background: corrColor(rho, muted) }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="pf-heat-tip" role="tooltip">
          <div className="font-semibold">
            {cleanName(rowId)} ({rowSym}) × {cleanName(colId)} ({colSym})
          </div>
          <div>ρ = {Number(rho).toFixed(3)}</div>
          {weightPct != null && <div>Weight {weightPct}%</div>}
        </div>
      )}
    </div>
  );
}

function buildOrderedIds(strategyIds, strategyMeta = {}) {
  return [...strategyIds].sort((a, b) => {
    const sa = strategyMeta[a]?.symbol || 'ZZZ';
    const sb = strategyMeta[b]?.symbol || 'ZZZ';
    if (sa !== sb) return sa.localeCompare(sb);
    return a.localeCompare(b);
  });
}

function groupBoundaries(ids, strategyMeta) {
  const ends = new Set();
  for (let i = 0; i < ids.length - 1; i += 1) {
    const cur = strategyMeta[ids[i]]?.symbol || '';
    const nxt = strategyMeta[ids[i + 1]]?.symbol || '';
    if (cur !== nxt) ends.add(i);
  }
  return ends;
}

export function CorrelationHeatmap({
  strategyIds = [],
  matrix = [],
  weights = [],
  strategyMeta = {},
  muted = false,
}) {
  const ids = useMemo(
    () => buildOrderedIds(strategyIds, strategyMeta),
    [strategyIds, strategyMeta],
  );
  const n = ids.length;
  const groupEnds = useMemo(() => groupBoundaries(ids, strategyMeta), [ids, strategyMeta]);

  const weightMap = {};
  strategyIds.forEach((id, i) => {
    weightMap[id] = weights[i] != null ? Number(weights[i]) : null;
  });

  const idToMatrixIndex = {};
  strategyIds.forEach((id, i) => { idToMatrixIndex[id] = i; });

  const symbols = useMemo(() => {
    const groups = [];
    let cur = null;
    ids.forEach((id) => {
      const sym = strategyMeta[id]?.symbol || 'OTHER';
      if (sym !== cur) {
        groups.push({ symbol: sym, count: 1 });
        cur = sym;
      } else {
        groups[groups.length - 1].count += 1;
      }
    });
    return groups;
  }, [ids, strategyMeta]);

  if (!n) {
    return (
      <div className="pf-heat-empty">
        <p className="text-sm text-desk-muted">No strategy data for correlation matrix.</p>
        <p className="mt-1 text-[0.65rem] text-desk-muted">
          Upload CSV from a strategy row, or wait for live closed trades.
        </p>
      </div>
    );
  }

  return (
    <div className="pf-heat-wrap">
      <div className="pf-heat-symbol-strip">
        {symbols.map((g) => (
          <span key={g.symbol} className="pf-heat-symbol-chip">
            {g.symbol}
            <span className="opacity-60"> · {g.count}</span>
          </span>
        ))}
      </div>
      <div className="pf-heat-scroll">
        <div
          className="pf-heat-grid"
          style={{
            gridTemplateColumns: `minmax(96px, auto) repeat(${n}, minmax(52px, 1fr))`,
            gridTemplateRows: `auto repeat(${n}, minmax(38px, auto))`,
          }}
        >
          <div className="pf-heat-corner" />
          {ids.map((id, j) => {
            const sym = strategyMeta[id]?.symbol || '';
            const groupEnd = groupEnds.has(j);
            return (
              <div
                key={`h-${id}`}
                className={`pf-heat-colhead ${groupEnd ? 'pf-heat-colhead--group-end' : ''}`}
                title={id}
              >
                <span className="pf-heat-colhead__sym">{sym}</span>
                <span className="pf-heat-colhead__id">{cleanName(id)}</span>
              </div>
            );
          })}
          {ids.map((rowId, i) => {
            const rowSym = strategyMeta[rowId]?.symbol || '';
            const rowGroupEnd = groupEnds.has(i);
            return (
              <Fragment key={`row-${rowId}`}>
                <div
                  className={`pf-heat-rowhead ${rowGroupEnd ? 'pf-heat-rowhead--group-end' : ''}`}
                  title={rowId}
                >
                  <span className="pf-heat-rowhead__sym">{rowSym}</span>
                  <span className="pf-heat-rowhead__id">{cleanName(rowId)}</span>
                </div>
                {ids.map((colId, j) => {
                  const mi = idToMatrixIndex[rowId];
                  const mj = idToMatrixIndex[colId];
                  const rho = matrix[mi]?.[mj] ?? (mi === mj ? 1 : 0);
                  const isDiag = mi === mj;
                  const w = weightMap[rowId];
                  const wpct = isDiag && w != null
                    ? (Math.abs(w) <= 1 ? w * 100 : w)
                    : null;
                  const colGroupEnd = groupEnds.has(j);
                  const isGroupEnd = rowGroupEnd || colGroupEnd;
                  return (
                    <CellTooltip
                      key={`${rowId}-${colId}`}
                      rowId={rowId}
                      colId={colId}
                      rowSym={rowSym}
                      colSym={strategyMeta[colId]?.symbol || ''}
                      rho={rho}
                      weightPct={wpct != null ? Number(wpct).toFixed(1) : null}
                      isGroupEnd={isGroupEnd}
                      muted={muted}
                    >
                      <span className={`pf-heat-val ${isDiag ? 'pf-heat-val--diag' : ''}`}>
                        {isDiag
                          ? (wpct != null && wpct > 0 ? `${Number(wpct).toFixed(0)}%` : '1')
                          : Number(rho).toFixed(2)}
                      </span>
                    </CellTooltip>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
      <div className="pf-heat-legend">
        <span>Negative ρ</span>
        <div className="pf-heat-legend-bar" />
        <span>Positive ρ</span>
        <span className="pf-heat-legend-note">Grouped by symbol · diagonal = weight</span>
      </div>
    </div>
  );
}

export default CorrelationHeatmap;
