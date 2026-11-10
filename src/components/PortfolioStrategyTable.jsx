import { Fragment, useRef, useState } from 'react';
import { FileUp, Trash2, Upload } from 'lucide-react';
import { Badge, Button } from './ui';
import { API } from '../config/deskApi';

import { getStrategyDisplayName as cleanName } from '../lib/strategyDisplayNames';

const SOURCE_BADGE = {
  hybrid: { variant: 'accent', label: 'Hybrid' },
  csv: { variant: 'success', label: 'CSV' },
  live: { variant: 'warning', label: 'Live' },
  none: { variant: 'default', label: 'Missing' },
};

function fmtINR(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v < 0 ? '-' : ''}\u20B9${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function fmtPct(v, d = 2) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(Number(v) * (Math.abs(v) <= 1 ? 100 : 1)).toFixed(d)}%`;
}

function WeightBar({ pct }) {
  const w = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div className="pf-weight-bar">
      <div className="pf-weight-bar__fill" style={{ width: `${w}%` }} />
      <span className="pf-weight-bar__label">{w.toFixed(1)}%</span>
    </div>
  );
}

function CsvStatus({ row }) {
  if (!row.csv_has_data) {
    return <span className="pf-csv-status pf-csv-status--empty">No CSV</span>;
  }
  const range = row.csv_date_from && row.csv_date_to
    ? `${row.csv_date_from} → ${row.csv_date_to}`
    : '—';
  return (
    <span className="pf-csv-status" title={range}>
      {row.csv_row_count} rows
    </span>
  );
}

function RowUpload({ strategyId, busy, onUpload, onClear, hasData }) {
  const inputRef = useRef(null);
  return (
    <div className="pf-row-actions">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f, strategyId);
          e.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title="Upload strategy CSV"
      >
        <FileUp className="h-3.5 w-3.5" />
        {busy ? '…' : 'CSV'}
      </Button>
      {hasData && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={busy}
          onClick={() => onClear(strategyId)}
          title="Clear CSV data"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export function PortfolioStrategyTable({
  strategies = [],
  onDataChange,
  onBulkUpload,
  bulkBusy = false,
}) {
  const [busyId, setBusyId] = useState(null);
  const [rowMsg, setRowMsg] = useState({});
  const bulkRef = useRef(null);

  const uploadStrategy = async (file, strategyId) => {
    setBusyId(strategyId);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(`${API}/portfolio/backtest/upload/${encodeURIComponent(strategyId)}`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail?.message || JSON.stringify(data.detail) || r.statusText);
      setRowMsg((m) => ({ ...m, [strategyId]: { ok: true, text: `${data.meta?.row_count || 0} rows` } }));
      onDataChange?.('hybrid');
    } catch (e) {
      setRowMsg((m) => ({ ...m, [strategyId]: { ok: false, text: e.message } }));
    } finally {
      setBusyId(null);
    }
  };

  const clearStrategy = async (strategyId) => {
    setBusyId(strategyId);
    try {
      await fetch(`${API}/portfolio/backtest/strategy/${encodeURIComponent(strategyId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setRowMsg((m) => ({ ...m, [strategyId]: { ok: true, text: 'Cleared' } }));
      onDataChange?.('hybrid');
    } catch (e) {
      setRowMsg((m) => ({ ...m, [strategyId]: { ok: false, text: String(e.message || e) } }));
    } finally {
      setBusyId(null);
    }
  };

  if (!strategies.length) {
    return (
      <p className="py-8 text-center text-sm text-desk-muted">
        No strategies in portfolio universe.
      </p>
    );
  }

  let lastSymbol = null;

  return (
    <div className="pf-strat-table-wrap">
      <div className="pf-strat-table-toolbar">
        <input
          ref={bulkRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          disabled={bulkBusy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onBulkUpload?.(f);
            e.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="default"
          size="xs"
          disabled={bulkBusy}
          onClick={() => bulkRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          {bulkBusy ? 'Uploading…' : 'Bulk CSV'}
        </Button>
        <a
          className="pf-link"
          href={`data:text/csv;charset=utf-8,${encodeURIComponent('Strategy,ExitTime,Symbol,Pnl,Quantity\nSN_S01,2025-01-03,SENSEX 79700 CE,705,20\n')}`}
          download="strategy_backtest_template.csv"
        >
          Template
        </a>
      </div>

      <table className="pf-strat-table">
        <thead>
          <tr>
            <th>Strategy</th>
            <th>Src</th>
            <th>CSV</th>
            <th>Weight</th>
            <th>Sharpe</th>
            <th>MaxDD</th>
            <th>Win%</th>
            <th>Cur</th>
            <th>Rec</th>
            <th>Δ</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {strategies.map((row) => {
            const sid = row.strategy_id;
            const sym = row.symbol || row.display_symbol || 'OTHER';
            const showGroup = sym !== lastSymbol;
            lastSymbol = sym;
            const src = SOURCE_BADGE[row.data_source] || SOURCE_BADGE.none;
            const msg = rowMsg[sid];
            const delta = row.delta_lots;
            return (
              <Fragment key={sid}>
                {showGroup && (
                  <tr className="pf-strat-group-row">
                    <td colSpan={11}>{sym}</td>
                  </tr>
                )}
                <tr className={delta !== 0 ? 'pf-row-delta' : ''}>
                  <td>
                    <div className="pf-strat-name">
                      <span className="font-mono">{cleanName(sid)}</span>
                    </div>
                    {msg?.text && (
                      <span className={`pf-row-msg ${msg.ok ? 'pf-row-msg--ok' : 'pf-row-msg--err'}`}>
                        {msg.text}
                      </span>
                    )}
                  </td>
                  <td><Badge variant={src.variant}>{src.label}</Badge></td>
                  <td><CsvStatus row={row} /></td>
                  <td><WeightBar pct={row.weight_pct} /></td>
                  <td className="tabular-nums">{row.sharpe ?? '—'}</td>
                  <td className="tabular-nums">{fmtINR(row.max_drawdown)}</td>
                  <td className="tabular-nums">{fmtPct(row.win_rate)}</td>
                  <td className="tabular-nums">{row.current_lots ?? 0}</td>
                  <td className={`tabular-nums ${delta !== 0 ? 'text-[var(--accent-cyan)] font-semibold' : ''}`}>
                    {row.recommended_lots ?? 0}
                  </td>
                  <td className="tabular-nums">
                    {!delta ? '—' : (
                      <span className={delta > 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                    )}
                  </td>
                  <td>
                    <RowUpload
                      strategyId={sid}
                      busy={busyId === sid}
                      hasData={row.csv_has_data}
                      onUpload={uploadStrategy}
                      onClear={clearStrategy}
                    />
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default PortfolioStrategyTable;
