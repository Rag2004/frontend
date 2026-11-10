import { useMemo, useRef, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FileUp, Trash2, Upload } from 'lucide-react';
import { Badge, Button } from '../ui';
import { cleanStrategyName, fmtCsvDay, fmtINR, fmtPct } from './utils/formatters';
import {
  drawdownRiskClass,
  recommendationFromRow,
  sharpeRiskClass,
  statusFromRow,
} from './utils/riskColors';
import { API } from '../../config/deskApi';

const SOURCE_BADGE = {
  hybrid: { variant: 'accent', label: 'HYBRID' },
  csv: { variant: 'success', label: 'CSV' },
  live: { variant: 'warning', label: 'LIVE' },
  none: { variant: 'default', label: 'MISSING' },
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'changes', label: 'Changes' },
  { id: 'missing', label: 'Missing data' },
];

const VIEW_MODES = [
  { id: 'base', label: 'Base (1 lot)' },
  { id: 'generated', label: 'Generated' },
];

// Explicit column widths (px). Applied to BOTH header and body cells so the
// virtualized rows (each its own table-layout:fixed context) line up with the header.
const COL_WIDTHS = {
  strategy_id: 120,
  source: 88,
  weight_pct: 100,
  sharpe: 72,
  avg_daily_pnl: 92,
  n_days: 96,
  total_pnl: 104,
  volatility: 88,
  max_drawdown: 110,
  win_rate: 64,
  current_lots: 48,
  recommended_lots: 48,
  manual_lots: 64,
  rec_action: 92,
  csv: 64,
};
const TABLE_MIN_WIDTH = Object.values(COL_WIDTHS).reduce((a, b) => a + b, 0);

/** Lot scale for Base (1) vs Generated (recommended_lots). */
function lotScale(row, viewMode) {
  if (viewMode !== 'generated') return 1;
  return Number(row?.recommended_lots) || 0;
}

function scaledMetric(row, key, viewMode) {
  const base = Number(row?.[key]);
  if (!Number.isFinite(base)) return null;
  return base * lotScale(row, viewMode);
}

function NumCell({ children, className = '' }) {
  return (
    <span className={`block whitespace-nowrap text-right font-mono text-[0.72rem] tabular-nums leading-tight ${className}`}>
      {children}
    </span>
  );
}

function WeightBar({ pct }) {
  const w = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="relative h-1.5 flex-1 min-w-[36px] rounded-full bg-white/10 overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full bg-pf-accent/70" style={{ width: `${w}%` }} />
      </div>
      <span className="shrink-0 font-mono text-[0.65rem] tabular-nums text-pf-muted w-10 text-right">{w.toFixed(1)}%</span>
    </div>
  );
}

function RowUpload({ strategyId, busy, hasData, onUpload, onClear }) {
  const inputRef = useRef(null);
  return (
    <div className="flex justify-end gap-0.5">
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
      <Button type="button" variant="ghost" size="xs" disabled={busy} onClick={() => inputRef.current?.click()} title="Upload CSV">
        <FileUp className="h-3.5 w-3.5" />
      </Button>
      {hasData && (
        <Button type="button" variant="ghost" size="xs" disabled={busy} onClick={() => onClear(strategyId)} title="Clear CSV">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function flattenWithGroups(rows) {
  const items = [];
  let lastSymbol = null;
  rows.forEach((row) => {
    const sym = row.original.symbol || row.original.display_symbol || 'OTHER';
    if (sym !== lastSymbol) {
      items.push({ type: 'group', symbol: sym, key: `g-${sym}-${items.length}` });
      lastSymbol = sym;
    }
    items.push({ type: 'row', row, key: row.id });
  });
  return items;
}

export function AllocationGrid({
  strategies = [],
  onDataChange,
  onBulkUpload,
  bulkBusy = false,
  isPaper = false,
  manualLots = {},
  onManualLotChange,
  manualDirty = false,
  onResetManual,
  onError,
  lotsSource = null,
  frontierLoading = false,
}) {
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [viewMode, setViewMode] = useState('base');
  const parentRef = useRef(null);
  const bulkRef = useRef(null);

  const filtered = useMemo(() => {
    if (filter === 'changes') return strategies.filter((s) => s.delta_lots !== 0);
    if (filter === 'missing') return strategies.filter((s) => s.data_source === 'none' || !s.csv_has_data);
    return strategies;
  }, [strategies, filter]);

  const sumMaxDdGenerated = useMemo(() => {
    return filtered.reduce((sum, s) => {
      const scaled = scaledMetric(s, 'max_drawdown', 'generated');
      return sum + Math.abs(scaled || 0);
    }, 0);
  }, [filtered]);

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
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = data?.detail?.message || data?.detail || r.statusText;
        const errs = Array.isArray(data?.detail?.errors) ? data.detail.errors.slice(0, 3).join('; ') : '';
        throw new Error(errs ? `${msg}: ${errs}` : String(msg));
      }
      onDataChange?.('backtest');
    } catch (e) {
      onError?.(String(e.message || e));
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
      onDataChange?.('backtest');
    } catch (e) {
      onError?.(String(e.message || e));
    } finally {
      setBusyId(null);
    }
  };

  const columns = useMemo(() => [
    {
      accessorKey: 'strategy_id',
      header: 'Strategy',
      cell: ({ getValue }) => <span className="font-mono text-[0.72rem] text-pf-text">{cleanStrategyName(getValue())}</span>,
    },
    {
      id: 'source',
      header: 'Source',
      cell: ({ row }) => {
        const src = SOURCE_BADGE[row.original.data_source] || SOURCE_BADGE.none;
        const status = statusFromRow(row.original, isPaper);
        // Paper desk: show PAPER; otherwise source badge (Status matched Source and added clutter).
        const badge = isPaper ? status : src;
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
    {
      accessorKey: 'weight_pct',
      header: 'Weight',
      cell: ({ getValue }) => <WeightBar pct={getValue()} />,
    },
    {
      accessorKey: 'sharpe',
      header: 'Sharpe',
      cell: ({ getValue }) => <NumCell className={sharpeRiskClass(getValue())}>{getValue() ?? '—'}</NumCell>,
    },
    {
      id: 'avg_daily_pnl',
      accessorFn: (row) => scaledMetric(row, 'avg_daily_pnl', viewMode),
      header: 'Avg/day',
      cell: ({ row }) => (
        <NumCell>{fmtINR(scaledMetric(row.original, 'avg_daily_pnl', viewMode))}</NumCell>
      ),
    },
    {
      accessorKey: 'n_days',
      header: () => (
        <span title="Unique dates present in this strategy CSV / live series">Days</span>
      ),
      cell: ({ row }) => {
        const n = row.original.n_days;
        const from = row.original.csv_date_from;
        const to = row.original.csv_date_to;
        const fromLabel = fmtCsvDay(from);
        const toLabel = fmtCsvDay(to);
        const range = from && to ? `${from} → ${to}` : null;
        return (
          <div className="text-right leading-tight" title={range || 'No CSV date span'}>
            <NumCell className="text-pf-muted">{n != null ? `${n}d` : '—'}</NumCell>
            {fromLabel && toLabel ? (
              <div className="mt-0.5 space-y-px text-[0.58rem] font-mono text-pf-muted/85 tabular-nums">
                <div className="whitespace-nowrap">{fromLabel}</div>
                <div className="whitespace-nowrap text-pf-muted/70">→ {toLabel}</div>
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      id: 'total_pnl',
      accessorFn: (row) => scaledMetric(row, 'total_pnl', viewMode),
      header: 'Total PnL',
      cell: ({ row }) => (
        <NumCell>{fmtINR(scaledMetric(row.original, 'total_pnl', viewMode))}</NumCell>
      ),
    },
    {
      id: 'volatility',
      accessorFn: (row) => scaledMetric(row, 'volatility', viewMode),
      header: () => (
        <span title="Daily PnL volatility — std of daily PnL in ₹">Vol ₹</span>
      ),
      cell: ({ row }) => (
        <NumCell className="text-pf-muted">{fmtINR(scaledMetric(row.original, 'volatility', viewMode))}</NumCell>
      ),
    },
    {
      id: 'max_drawdown',
      accessorFn: (row) => scaledMetric(row, 'max_drawdown', viewMode),
      header: 'MaxDD',
      cell: ({ row }) => {
        const v = scaledMetric(row.original, 'max_drawdown', viewMode);
        return <NumCell className={drawdownRiskClass(v)}>{fmtINR(v)}</NumCell>;
      },
    },
    {
      accessorKey: 'win_rate',
      header: 'Win%',
      cell: ({ getValue }) => <NumCell>{fmtPct(getValue())}</NumCell>,
    },
    {
      accessorKey: 'current_lots',
      header: 'Cur',
      cell: ({ getValue }) => <NumCell className="text-pf-muted">{getValue() ?? 0}</NumCell>,
    },
    {
      accessorKey: 'recommended_lots',
      header: 'Rec',
      cell: ({ row }) => (
        <NumCell className={row.original.delta_lots !== 0 ? 'text-pf-accent font-semibold' : ''}>
          {row.original.recommended_lots ?? 0}
        </NumCell>
      ),
    },
    {
      id: 'manual_lots',
      header: 'Manual',
      enableSorting: false,
      cell: ({ row }) => {
        const sid = row.original.strategy_id;
        const missing = row.original.data_source === 'none';
        const val = missing ? 0 : (manualLots[sid] ?? row.original.recommended_lots ?? 0);
        const differs = !missing && Number(val) !== Number(row.original.recommended_lots ?? 0);
        return (
          <input
            type="number"
            min={0}
            max={50}
            step={1}
            disabled={missing}
            title={missing ? 'No CSV/live data — Manual lots locked at 0' : undefined}
            className={`w-full rounded border bg-black/20 px-1 py-0.5 text-right font-mono text-[0.72rem] tabular-nums ${
              missing
                ? 'border-pf-border text-pf-muted opacity-60 cursor-not-allowed'
                : differs
                  ? 'border-pf-accent text-pf-accent'
                  : 'border-pf-border text-pf-text'
            }`}
            value={val}
            aria-label={`Manual lots for ${cleanStrategyName(sid)}`}
            onChange={(e) => {
              if (missing) return;
              const n = parseInt(e.target.value, 10);
              onManualLotChange?.(sid, Number.isFinite(n) ? Math.max(0, Math.min(50, n)) : 0);
            }}
          />
        );
      },
    },
    {
      id: 'rec_action',
      header: 'Action',
      cell: ({ row }) => {
        const r = recommendationFromRow(row.original);
        return <Badge variant={r.variant}>{r.label}</Badge>;
      },
    },
    {
      id: 'csv',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <RowUpload
          strategyId={row.original.strategy_id}
          busy={busyId === row.original.strategy_id}
          hasData={row.original.csv_has_data}
          onUpload={uploadStrategy}
          onClear={clearStrategy}
        />
      ),
    },
  ], [busyId, isPaper, viewMode, manualLots, onManualLotChange]);

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    autoResetAll: false,
    initialState: { sorting: [{ id: 'strategy_id', desc: false }] },
  });

  const tableRows = table.getRowModel().rows;
  const flatItems = useMemo(
    () => flattenWithGroups(tableRows),
    [tableRows],
  );

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (flatItems[i]?.type === 'group' ? 26 : 40),
    overscan: 10,
  });

  const colCount = columns.length;

  return (
    <div className="pf-inst-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="pf-inst-section-title">Strategy Allocation</h2>
          <p className="text-[var(--pf-meta-size)] text-pf-muted mt-0.5">
            {viewMode === 'generated'
              ? 'Generated — Avg/day, Total PnL, Vol ₹, MaxDD scaled by Rec lots'
              : 'Base — all ₹ metrics at 1 lot'}
            {lotsSource === 'frontier_optimal'
              ? ' · REC from frontier Optimal'
              : frontierLoading || lotsSource === 'continuous_pending'
                ? ' · REC pending frontier Optimal…'
                : ''}
            {manualDirty ? ' · Manual lots differ from Rec' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {manualDirty && (
            <Button type="button" variant="ghost" size="xs" onClick={onResetManual}>
              Reset Manual to Rec
            </Button>
          )}
          <div className="pnl-env-seg" role="group" aria-label="Metric view">
            {VIEW_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={viewMode === m.id ? 'active' : ''}
                onClick={() => setViewMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="pnl-env-seg" role="group" aria-label="Row filter">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>
            ))}
          </div>
          <input ref={bulkRef} type="file" accept=".csv,text/csv" className="sr-only" disabled={bulkBusy} onChange={(e) => { onBulkUpload?.(e.target.files?.[0]); e.target.value = ''; }} />
          <Button type="button" variant="default" size="xs" disabled={bulkBusy} onClick={() => bulkRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> {bulkBusy ? 'Uploading…' : 'Bulk CSV'}
          </Button>
        </div>
      </div>
      <div ref={parentRef} className="max-h-[480px] overflow-auto rounded-lg border border-pf-border/80">
        <table key={viewMode} className="w-full table-fixed border-collapse text-[var(--pf-body-size)]" style={{ minWidth: `${TABLE_MIN_WIDTH}px` }}>
          <thead className="sticky top-0 z-10 bg-[var(--pf-card)]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const numeric = ['sharpe', 'avg_daily_pnl', 'n_days', 'total_pnl', 'volatility', 'max_drawdown', 'win_rate', 'current_lots', 'recommended_lots', 'manual_lots'].includes(h.column.id);
                  return (
                    <th
                      key={h.id}
                      className={`px-2 py-2.5 text-[0.6rem] font-medium uppercase tracking-wide text-pf-muted border-b border-pf-border select-none ${h.column.getCanSort() ? 'cursor-pointer hover:text-pf-text' : ''} ${numeric ? 'text-right' : 'text-left'}`}
                      style={{ width: `${COL_WIDTHS[h.column.id] ?? 80}px` }}
                      onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                      aria-sort={h.column.getIsSorted() ? (h.column.getIsSorted() === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vItem) => {
              const item = flatItems[vItem.index];
              if (item.type === 'group') {
                return (
                  <tr
                    key={item.key}
                    className="bg-pf-accent/[0.06]"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', minWidth: `${TABLE_MIN_WIDTH}px`, height: `${vItem.size}px`, transform: `translateY(${vItem.start}px)`, display: 'table', tableLayout: 'fixed' }}
                  >
                    <td colSpan={colCount} className="px-2 py-1 text-[0.6rem] font-semibold uppercase tracking-wide text-pf-accent border-b border-pf-border/60">
                      {item.symbol}
                    </td>
                  </tr>
                );
              }
              const { row } = item;
              return (
                <tr
                  key={item.key}
                  className={`hover:bg-white/[0.025] border-b border-pf-border/30 ${row.original.delta_lots !== 0 ? 'shadow-[inset_2px_0_0_var(--pf-accent)]' : ''}`}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', minWidth: `${TABLE_MIN_WIDTH}px`, height: `${vItem.size}px`, transform: `translateY(${vItem.start}px)`, display: 'table', tableLayout: 'fixed' }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-2 py-2 align-middle overflow-hidden" style={{ width: `${COL_WIDTHS[cell.column.id] ?? 80}px` }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!flatItems.length && (
          <p className="py-10 text-center text-sm text-pf-muted">No strategies match filter.</p>
        )}
      </div>
      {viewMode === 'generated' && filtered.length > 0 && (
        <p className="mt-2.5 text-[var(--pf-meta-size)] text-pf-muted">
          Total MaxDD at recommended lots:{' '}
          <span className="font-mono tabular-nums text-pf-danger">{fmtINR(-sumMaxDdGenerated)}</span>
        </p>
      )}
    </div>
  );
}
