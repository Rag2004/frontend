import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronDown, ChevronRight, Trash2, Settings2, Calendar } from 'lucide-react';
import { toIST } from '../utils/formatIST';
import { DeskTable } from '../components/DeskTable';
import { PositionLegBadge } from '../components/PositionLegBadge';
import { useApiPoll } from '../hooks/useApiPoll';
import { positionLegRowClass } from '../lib/positionLeg';
import { formatStrategyLabel, getStrategyDisplayName, strategyMatchesSearch } from '../lib/strategyDisplayNames';
import {
  NF_S0_10_ID,
  NF_S0_10_WAVES,
  groupNfS010Positions,
  nfS010UntaggedSectionLabel,
  nfS010WaveSectionLabel,
} from '../lib/strategyWaveUi';
import { getDeskBookConfig } from '../config/deskProfile';
import { API } from '../config/deskApi';

const DESK_BOOK = getDeskBookConfig();
const LOAD_LIMIT = 2000;
const cleanName = (id) => getStrategyDisplayName(id);

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toISTDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d)) return null;
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
}

function todayIST() {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function isInRange(ts, startDate, endDate) {
  const d = toISTDate(ts);
  if (!d) return false;
  return d >= startDate && d <= endDate;
}

function pnlColor(v) {
  if (v > 0) return 'green';
  if (v < 0) return 'red';
  if (v === 0) return 'text-gray-400';
  return '';
}

function fmtINR(v) {
  if (v == null) return '—';
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Underlying + strike + CE/PE for options rows (falls back to underlying only). */
function formatOptionInstrument(row) {
  const u = row?.underlying?.trim() || '';
  const strike = row?.strike;
  const ot = (row?.option_type || '').trim();
  const strikePart = strike != null && strike !== '' ? String(strike) : '';
  const typePart = ot || '';
  if (!u && !strikePart && !typePart) return '—';
  const tail = [strikePart, typePart].filter(Boolean).join(' ');
  return tail ? `${u} ${tail}`.trim() : u || '—';
}

function statusBadgeClass(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('reject')) return 'ord-badge ord-badge--rejected';
  if (s.includes('pending') || s.includes('open') || s.includes('transit')) return 'ord-badge ord-badge--pending';
  if (s.includes('partial')) return 'ord-badge ord-badge--partial';
  if (s.includes('complete') || s.includes('filled') || s.includes('traded')) return 'ord-badge ord-badge--filled';
  return 'ord-badge';
}

/**
 * Per-leg realized PnL — must match `QuantEngine_Backend/app/pnl/engine.py`:
 * - Prefer stored `pnl` when present (RMS writes this on close).
 * - Else `(position_side || 'BUY')`: SELL → (entry − exit)×qty, else (exit − entry)×qty.
 * Do not infer direction from exit order `side`; missing `position_side` defaults to BUY like the engine,
 * otherwise totals disagree with the PnL page.
 */
function computeTradePnl(trade) {
  const stored = trade?.pnl;
  if (stored != null && Number.isFinite(Number(stored))) return Number(stored);

  const entry = Number(trade.entry_avg_price);
  const exit = Number(trade.fill_price);
  const qty = Number(trade.quantity);
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || !qty) return null;

  const posSide = String(trade.position_side || 'BUY').trim().toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
  if (posSide === 'SELL') return (entry - exit) * qty;
  return (exit - entry) * qty;
}

const TABS = [
  { key: 'positions', label: 'Live Positions' },
  { key: 'orders', label: 'Order History' },
  { key: 'closed', label: 'Closed Trades' },
];

// Map backend ``price_source`` tags to desk-facing short labels + color cues so any
// broker-vs-dashboard PnL discrepancy is traceable to fill-price provenance at a glance.
// Kept here (not in a CSS module) to minimize touch surface for the parity fix.
const PRICE_SOURCE_BADGES = {
  TRADED_PRICE: { label: 'TRADED', tone: 'ok', title: 'Broker tradedPrice (strongest signal)' },
  AVERAGE_TRADED_PRICE: { label: 'AVG_TRADED', tone: 'ok', title: 'Broker averageTradedPrice (VWAP)' },
  LIMIT_PRICE_FALLBACK: { label: 'LIMIT', tone: 'warn', title: 'Fallback to intent limit price' },
  REFERENCE_LTP_FALLBACK: { label: 'LTP_REF', tone: 'warn', title: 'Fallback to intent reference LTP' },
  SNAPSHOT_PRICE_FALLBACK: { label: 'SNAPSHOT', tone: 'warn', title: 'Fallback to Dhan GET body price echo' },
  SANDBOX_DEFAULT: { label: 'SANDBOX', tone: 'warn', title: 'Sandbox hardcoded default' },
  MISSING_PRICE: { label: 'MISSING', tone: 'err', title: 'No price resolved (should not close)' },
  UNKNOWN: { label: 'LEGACY', tone: 'neutral', title: 'Pre-parity-fix trade (no provenance)' },
};

function priceSourceBadge(src) {
  const key = String(src || 'UNKNOWN').toUpperCase();
  return PRICE_SOURCE_BADGES[key] || PRICE_SOURCE_BADGES.UNKNOWN;
}

const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
];

function getPresetRange(preset) {
  const today = todayIST();
  switch (preset) {
    case 'today': return { start: today, end: today };
    case 'yesterday': { const y = shiftDate(today, -1); return { start: y, end: y }; }
    case '7d': return { start: shiftDate(today, -6), end: today };
    case '30d': return { start: shiftDate(today, -29), end: today };
    default: return { start: today, end: today };
  }
}

function DateNav({ datePreset, setDatePreset, customDate, setCustomDate, dateRange, strategyFilter, setStrategyFilter, statusFilter, setStatusFilter, showStatusFilter }) {
  const dateRef = useRef(null);

  const handlePrev = () => {
    if (datePreset === 'today' || datePreset === 'yesterday' || datePreset === 'custom') {
      const prevDay = shiftDate(dateRange.start, -1);
      setCustomDate(prevDay);
      setDatePreset('custom');
    }
  };
  const handleNext = () => {
    const today = todayIST();
    if (datePreset === 'yesterday' || datePreset === 'custom') {
      const nextDay = shiftDate(dateRange.end, 1);
      if (nextDay <= today) {
        setCustomDate(nextDay);
        setDatePreset('custom');
      }
    }
  };

  const isSingleDay = dateRange.start === dateRange.end;
  const canNext = dateRange.end < todayIST();

  return (
    <div className="ord-date-nav">
      <div className="ord-date-controls">
        <select
          className="ord-date-dropdown"
          value={datePreset === 'custom' ? '' : datePreset}
          onChange={(e) => { if (e.target.value) setDatePreset(e.target.value); }}
          aria-label="Date range"
        >
          {DATE_PRESETS.map(({ key, label }) => (
            <option key={key} value={key}>{label}</option>
          ))}
          {datePreset === 'custom' && <option value="" disabled>Custom: {formatDateDisplay(customDate)}</option>}
        </select>
        <div className="ord-date-pick">
          <button type="button" className={`ord-date-pick__btn ${datePreset === 'custom' ? 'active' : ''}`} onClick={() => dateRef.current?.showPicker?.()} title="Pick a date">
            <Calendar size={13} />
            <span>{datePreset === 'custom' ? formatDateDisplay(customDate) : 'Select Date'}</span>
          </button>
          <input ref={dateRef} type="date" className="ord-date-hidden" value={customDate} max={todayIST()} onChange={(e) => { setCustomDate(e.target.value); setDatePreset('custom'); }} tabIndex={-1} />
        </div>
        {isSingleDay && (
          <div className="ord-date-arrows">
            <button type="button" className="ord-date-arrow-btn" onClick={handlePrev} title="Previous day" aria-label="Previous day">
              ‹
            </button>
            <span className="ord-date-arrows__label">{formatDateDisplay(dateRange.start)}</span>
            <button type="button" className="ord-date-arrow-btn" onClick={handleNext} disabled={!canNext} title="Next day" aria-label="Next day">
              ›
            </button>
          </div>
        )}
        {!isSingleDay && (
          <span className="ord-date-range-label">{formatDateDisplay(dateRange.start)} — {formatDateDisplay(dateRange.end)}</span>
        )}
      </div>
      <div className="ord-date-nav__right">
        {showStatusFilter && (
          <label className="ord-status-field">
            <span className="ord-status-field__label">Status</span>
            <select className="ord-status-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status filter">
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="filled">Filled</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        )}
        <input
          type="search"
          className="ord-search"
          placeholder="Search strategy…"
          value={strategyFilter}
          onChange={(e) => setStrategyFilter(e.target.value)}
          aria-label="Search strategy"
        />
      </div>
    </div>
  );
}

export default function Orders() {
  const [broker, setBroker] = useState(DESK_BOOK.broker);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [closed, setClosed] = useState([]);
  const [closedTotal, setClosedTotal] = useState(0);
  const [tab, setTab] = useState('positions');
  const [strategyFilter, setStrategyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);
  const [orderActionMsg, setOrderActionMsg] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [adminOpen, setAdminOpen] = useState(false);
  const [clearExpiryInput, setClearExpiryInput] = useState('');
  const adminRef = useRef(null);

  const [orderDatePreset, setOrderDatePreset] = useState('today');
  const [orderCustomDate, setOrderCustomDate] = useState(todayIST());
  const [closedDatePreset, setClosedDatePreset] = useState('today');
  const [closedCustomDate, setClosedCustomDate] = useState(todayIST());

  const orderDateRange = useMemo(() =>
    orderDatePreset === 'custom' ? { start: orderCustomDate, end: orderCustomDate } : getPresetRange(orderDatePreset),
    [orderDatePreset, orderCustomDate]
  );
  const closedDateRange = useMemo(() =>
    closedDatePreset === 'custom' ? { start: closedCustomDate, end: closedCustomDate } : getPresetRange(closedDatePreset),
    [closedDatePreset, closedCustomDate]
  );

  const brokerParam = broker === 'dhan_sandbox' ? 'dhan_sandbox' : broker === 'kotak_sandbox' ? 'kotak_sandbox' : DESK_BOOK.broker;

  const loadPositions = useCallback(() => {
    const q = brokerParam ? `?broker=${brokerParam}` : '';
    fetch(`${API}/positions${q}`)
      .then((r) => r.json())
      .then((d) => setPositions(d.positions || []));
  }, [brokerParam]);

  const loadOrders = useCallback(() => {
    const base = `${API}/orders?limit=${LOAD_LIMIT}&skip=0`;
    const url = brokerParam ? `${base}&broker=${brokerParam}` : base;
    fetch(url)
      .then((r) => (r.ok ? r.json() : { orders: [], total: 0 }))
      .then((d) => {
        setOrders(d.orders || []);
        setOrderTotal(typeof d.total === 'number' ? d.total : (d.orders || []).length);
      })
      .catch(() => { setOrders([]); setOrderTotal(0); });
  }, [brokerParam]);

  const loadClosed = useCallback(() => {
    const base = `${API}/closed-trades?limit=${LOAD_LIMIT}&skip=0`;
    const url = brokerParam ? `${base}&broker=${brokerParam}` : base;
    fetch(url)
      .then((r) => (r.ok ? r.json() : { trades: [], total: 0 }))
      .then((d) => {
        setClosed(d.trades || []);
        setClosedTotal(typeof d.total === 'number' ? d.total : (d.trades || []).length);
      })
      .catch(() => { setClosed([]); setClosedTotal(0); });
  }, [brokerParam]);

  useEffect(() => { loadOrders(); loadClosed(); }, [loadOrders, loadClosed]);
  useApiPoll(loadPositions, 8000, true, [brokerParam]);

  useEffect(() => {
    const onDoc = (e) => { if (!adminRef.current?.contains(e.target)) setAdminOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const clearAllPositions = useCallback(() => {
    if (!window.confirm('Clear ALL open positions? Cannot be undone.')) return;
    fetch(`${API}/clear-all-positions`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => { if (d.ok) { loadPositions(); loadClosed(); } })
      .catch(() => {});
  }, [loadPositions, loadClosed]);

  const clearPositionsByExpiry = useCallback(
    (expiry) => {
      if (!expiry || expiry.trim().length < 8) return;
      if (!window.confirm(`Clear positions with expiry ${expiry}?`)) return;
      fetch(`${API}/clear-positions-by-expiry?expiry=${encodeURIComponent(expiry)}`, { method: 'POST' })
        .then((r) => r.json())
        .then((d) => { if (d.ok) { loadPositions(); loadClosed(); } })
        .catch(() => {});
    },
    [loadPositions, loadClosed]
  );

  const dismissPendingOrder = useCallback(
    async (row) => {
      const oid = String(row.order_id || '').trim();
      if (!oid) {
        setOrderActionMsg('Missing order id');
        return;
      }
      if (
        !window.confirm(
          'Remove this PENDING row from the desk blotter? Confirm the broker order is cancelled or final first.'
        )
      ) {
        return;
      }
      setOrderActionMsg(null);
      try {
        const r = await fetch(`${API}/orders/dismiss-pending`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: oid, confirm: 'DISMISS_PENDING_ORDER' }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          const d = j.detail;
          const msg = typeof d === 'string' ? d : r.statusText;
          throw new Error(msg || 'Dismiss failed');
        }
        loadOrders();
      } catch (e) {
        setOrderActionMsg(e.message || 'Dismiss failed');
      }
    },
    [loadOrders]
  );

  const reconcilePendingOrder = useCallback(
    async (row) => {
      const oid = String(row.order_id || '').trim();
      if (!oid) {
        setOrderActionMsg('Missing order id');
        return;
      }
      setOrderActionMsg(null);
      try {
        const r = await fetch(`${API}/orders/reconcile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: oid }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          const d = j.detail;
          const msg = typeof d === 'string' ? d : r.statusText;
          throw new Error(msg || 'Reconcile failed');
        }
        loadOrders();
        loadClosed();
        loadPositions();
      } catch (e) {
        setOrderActionMsg(e.message || 'Reconcile failed');
      }
    },
    [loadOrders, loadClosed, loadPositions]
  );

  const match = (sid) => strategyMatchesSearch(sid, strategyFilter);

  const filteredPositions = positions.filter((p) => match(p.strategy_id));

  const filteredOrders = useMemo(() => {
    let list = orders.filter((o) => match(o.strategy_id) && isInRange(o.filled_at, orderDateRange.start, orderDateRange.end));
    if (statusFilter) {
      list = list.filter((o) => {
        const rowStatus = (o.status || '').toLowerCase();
        const s = (o.broker_status || '').toLowerCase();
        if (statusFilter === 'pending') return s.includes('pending') || s.includes('open') || s.includes('transit');
        if (statusFilter === 'rejected') {
          return rowStatus.includes('reject') || rowStatus.includes('cancel')
            || s.includes('reject') || s.includes('cancel');
        }
        if (statusFilter === 'filled') {
          return rowStatus === 'filled'
            || s.includes('complete') || s.includes('filled') || s.includes('traded');
        }
        return true;
      });
    }
    return list;
  }, [orders, strategyFilter, statusFilter, orderDateRange]);

  const filteredClosed = useMemo(() =>
    closed.filter((t) => match(t.strategy_id) && isInRange(t.filled_at, closedDateRange.start, closedDateRange.end)),
    [closed, strategyFilter, closedDateRange]
  );

  const positionGroups = useMemo(() => {
    const map = new Map();
    filteredPositions.forEach((p) => {
      const sid = p.strategy_id || 'Unknown';
      if (!map.has(sid)) map.set(sid, []);
      map.get(sid).push(p);
    });
    return [...map.entries()].map(([sid, legs]) => {
      let totalUnrealized = 0;
      legs.forEach((l) => { totalUnrealized += Number(l.unrealized_pnl) || 0; });
      return { strategyId: sid, legs, legCount: legs.length, totalUnrealized };
    });
  }, [filteredPositions]);

  const toggleGroup = (sid) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  };

  const closedWithPnl = useMemo(() =>
    filteredClosed.map((t) => ({ ...t, _pnl: computeTradePnl(t) })),
    [filteredClosed]
  );

  const toggleExpand = (id) => setExpandedRow((prev) => (prev === id ? null : id));

  const posLegColumns = useMemo(() => [
    { id: 'leg', header: 'Leg', cell: ({ row }) => <PositionLegBadge position={row.original} /> },
    { accessorKey: 'underlying', header: 'Instrument', cell: ({ getValue }) => getValue() || '—' },
    { accessorKey: 'expiry', header: 'Expiry', cell: ({ getValue }) => getValue() || '—' },
    { accessorKey: 'strike', header: 'Strike', meta: { numeric: true }, cell: ({ getValue }) => getValue() ?? '—' },
    { accessorKey: 'option_type', header: 'Type', cell: ({ getValue }) => getValue() || '—' },
    {
      accessorKey: 'side', header: 'Side',
      cell: ({ getValue }) => {
        const v = getValue();
        return <span className={v === 'SELL' ? 'text-amber-400' : v === 'BUY' ? 'text-sky-400' : ''}>{v}</span>;
      },
    },
    { accessorKey: 'quantity', header: 'Qty', meta: { numeric: true }, cell: ({ getValue }) => getValue() },
    { accessorKey: 'avg_price', header: 'Avg Price', meta: { numeric: true }, cell: ({ getValue }) => getValue() },
    {
      accessorKey: 'unrealized_pnl', header: 'Unreal PnL', meta: { numeric: true },
      cell: ({ getValue }) => {
        const v = Number(getValue());
        return <span className={pnlColor(v)}>{Number.isFinite(v) ? fmtINR(v) : '—'}</span>;
      },
    },
    { accessorKey: 'opened_at', header: 'Entry', cell: ({ getValue }) => toIST(getValue()) },
  ], []);

  const orderColumns = useMemo(() => [
    { accessorKey: 'filled_at', header: 'Time', cell: ({ getValue }) => toIST(getValue()), id: 'time' },
    {
      id: 'strategy',
      header: 'Strategy',
      cell: ({ row }) => formatStrategyLabel(row.original.strategy_id, row.original.wave),
    },
    {
      id: 'instrument',
      header: 'Instrument',
      cell: ({ row }) => <span className="ord-instrument-cell">{formatOptionInstrument(row.original)}</span>,
    },
    {
      accessorKey: 'side', header: 'Side',
      cell: ({ getValue }) => {
        const v = getValue();
        return <span className={v === 'SELL' ? 'text-amber-400' : v === 'BUY' ? 'text-sky-400' : ''}>{v}</span>;
      },
    },
    { accessorKey: 'quantity', header: 'Qty', meta: { numeric: true }, cell: ({ getValue }) => getValue() },
    { accessorKey: 'fill_price', header: 'Fill Price', meta: { numeric: true }, cell: ({ getValue }) => getValue() },
    {
      id: 'order_status',
      header: 'Status',
      cell: ({ row }) => {
        const st = row.original.status || row.original.broker_status;
        return <span className={statusBadgeClass(st)}>{st || '—'}</span>;
      },
    },
    {
      id: 'reject_detail',
      header: 'Reject / detail',
      cell: ({ row }) => {
        const rr = String(row.original.rejection_reason || '').trim();
        if (rr) return <span className="ord-reject-detail">{rr}</span>;
        return row.original.broker_status || row.original.order_tag || '—';
      },
    },
    {
      accessorKey: 'order_class', header: 'Type',
      cell: ({ getValue }) => {
        const v = getValue();
        return v ? <span className={v === 'ENTRY' ? 'badge badge-entry' : 'badge badge-exit'}>{v}</span> : '—';
      },
    },
    { accessorKey: 'order_tag', header: 'Tag', cell: ({ getValue }) => getValue() || '—' },
    {
      id: 'order_actions',
      header: '',
      cell: ({ row }) => {
        const st = String(row.original.status || '').toUpperCase();
        if (st !== 'PENDING' || !String(row.original.order_id || '').trim()) return null;
        return (
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border border-sky-600/60 text-sky-300 hover:bg-sky-900/30"
              onClick={(e) => {
                e.stopPropagation();
                reconcilePendingOrder(row.original);
              }}
            >
              Reconcile
            </button>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border border-amber-600/60 text-amber-300 hover:bg-amber-900/30"
              onClick={(e) => {
                e.stopPropagation();
                dismissPendingOrder(row.original);
              }}
            >
              Dismiss
            </button>
          </div>
        );
      },
    },
  ], [dismissPendingOrder, reconcilePendingOrder]);

  const closedColumns = useMemo(() => [
    {
      id: 'strategy',
      header: 'Strategy',
      cell: ({ row }) => formatStrategyLabel(row.original.strategy_id, row.original.wave),
    },
    { accessorKey: 'leg_role', header: 'Leg', cell: ({ getValue }) => getValue() || '—' },
    {
      id: 'instrument',
      header: 'Instrument',
      cell: ({ row }) => <span className="ord-instrument-cell">{formatOptionInstrument(row.original)}</span>,
    },
    { accessorKey: 'entry_avg_price', header: 'Entry', meta: { numeric: true }, cell: ({ getValue }) => getValue() != null ? Number(getValue()).toFixed(2) : '—' },
    { accessorKey: 'fill_price', header: 'Exit', meta: { numeric: true }, cell: ({ getValue }) => getValue() != null ? Number(getValue()).toFixed(2) : '—' },
    { accessorKey: 'quantity', header: 'Qty', meta: { numeric: true }, cell: ({ getValue }) => getValue() },
    {
      id: '_pnl', header: 'PnL', meta: { numeric: true },
      accessorFn: (row) => row._pnl,
      cell: ({ row }) => {
        const v = row.original._pnl;
        return v != null ? <span className={`font-semibold ${pnlColor(v)}`}>₹{fmtINR(v)}</span> : '—';
      },
    },
    { accessorKey: 'exit_type', header: 'Exit Type', cell: ({ getValue }) => getValue() || '—' },
    {
      id: 'price_source',
      header: 'Source',
      // Provenance badge: helps the desk immediately see *why* dashboard PnL might not
      // match the broker app — e.g. LTP_REF / LIMIT means we fell back, not a broker fill.
      cell: ({ row }) => {
        const b = priceSourceBadge(row.original.price_source);
        return (
          <span
            className={`ord-src-badge ord-src-badge--${b.tone}`}
            title={b.title}
          >
            {b.label}
          </span>
        );
      },
    },
    { accessorKey: 'entry_time', header: 'Entry Time', cell: ({ getValue }) => toIST(getValue()) },
    { accessorKey: 'filled_at', header: 'Exit Time', cell: ({ getValue }) => toIST(getValue()) },
  ], []);

  function renderExpandedDetail(data) {
    const keys = ['order_id', 'trade_id', 'security_id', 'status', 'order_class', 'order_tag', 'broker_status', 'rejection_reason', 'wave', 'leg_role', 'leg_group_id', 'exit_type', 'expiry', 'strike', 'option_type', 'position_side', 'pnl', 'price_source', 'raw_traded_price', 'raw_average_traded_price'];
    const entries = keys.filter((k) => data[k] != null && data[k] !== '').map((k) => [k, String(data[k])]);
    if (entries.length === 0) return null;
    return (
      <div className="ord-expand-panel">
        {entries.map(([k, v]) => (
          <div key={k} className="ord-expand-cell">
            <span className="ord-expand-key">{k}</span>
            <span className="ord-expand-val">{v}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="ord-page">
      {/* Tabs + toolbar */}
      <div className="ord-toolbar">
        <div className="ord-tabs" role="tablist">
          {TABS.map(({ key, label }) => {
            const count = key === 'positions' ? positions.length
              : key === 'orders' ? filteredOrders.length
              : filteredClosed.length;
            return (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => { setTab(key); setExpandedRow(null); }}>
                {label} <span className="ord-tab-count">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="ord-toolbar__right">
          <div className="ord-env-seg" role="group" aria-label="Broker">
            {DESK_BOOK.segments.map(({ label, value }) => (
              <button
                key={value}
                type="button"
                className={broker === value ? 'active' : ''}
                onClick={() => {
                  if (!DESK_BOOK.locked) setBroker(value);
                }}
                disabled={DESK_BOOK.locked}
                title={DESK_BOOK.locked ? `This desk is fixed to ${label}` : undefined}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'positions' && (
            <input
              type="search"
              className="ord-search"
              placeholder="Search strategy…"
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value)}
              aria-label="Search strategy"
            />
          )}
          {tab === 'positions' && positions.length > 0 && (
            <div className="ord-admin" ref={adminRef}>
              <button type="button" className="ord-admin__trigger" onClick={() => setAdminOpen((o) => !o)} title="Admin actions">
                <Settings2 size={14} />
              </button>
              {adminOpen && (
                <div className="ord-admin__panel">
                  <div className="ord-admin__row">
                    <input type="text" placeholder="Expiry YYYY-MM-DD" value={clearExpiryInput} onChange={(e) => setClearExpiryInput(e.target.value)} className="ord-admin__input" />
                    <button type="button" className="ord-admin__btn ord-admin__btn--warn" onClick={() => clearPositionsByExpiry(clearExpiryInput)}>
                      <Trash2 size={12} /> Clear expiry
                    </button>
                  </div>
                  <button type="button" className="ord-admin__btn ord-admin__btn--danger" onClick={clearAllPositions}>
                    <Trash2 size={12} /> Clear all positions
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tab 1: Live Positions — strategy-grouped */}
      {tab === 'positions' && (
        <div className="ord-positions">
          {positionGroups.length === 0 ? (
            <div className="ord-empty">{strategyFilter ? `No positions for "${strategyFilter}"` : 'No open positions'}</div>
          ) : (
            positionGroups.map(({ strategyId, legs, legCount, totalUnrealized }) => {
              const collapsed = collapsedGroups.has(strategyId);
              const isNfWaveBook = strategyId === NF_S0_10_ID;
              const waveGroups = isNfWaveBook ? groupNfS010Positions(legs) : null;
              return (
                <div key={strategyId} className="ord-group">
                  <button type="button" className="ord-group__header" onClick={() => toggleGroup(strategyId)}>
                    <span className="ord-group__chevron">{collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>
                    <span className="ord-group__name">{cleanName(strategyId)}</span>
                    <span className="ord-group__meta">{legCount} leg{legCount !== 1 ? 's' : ''}</span>
                    <span className={`ord-group__pnl ${pnlColor(totalUnrealized)}`}>₹{fmtINR(totalUnrealized)}</span>
                  </button>
                  {!collapsed && (
                    <div className="ord-group__body">
                      {waveGroups ? (
                        <div className="space-y-3">
                          {NF_S0_10_WAVES.map((wave) => {
                            const waveLegs = waveGroups.waves[wave];
                            return (
                              <div key={wave}>
                                <div className="mb-1 font-mono text-xs text-desk-muted">
                                  {nfS010WaveSectionLabel(wave)}
                                  {waveLegs.length
                                    ? ` · ${waveLegs.length} leg${waveLegs.length === 1 ? '' : 's'}`
                                    : ''}
                                </div>
                                {waveLegs.length === 0 ? (
                                  <div className="ord-empty">No open positions for this wave.</div>
                                ) : (
                                  <DeskTable
                                    data={waveLegs}
                                    columns={posLegColumns}
                                    getRowId={(row, i) => `${row.strategy_id}-${row.security_id}-w${wave}-${i}`}
                                    getRowClassName={(row) => positionLegRowClass(row)}
                                    density="default"
                                    onRowClick={(row) =>
                                      toggleExpand(`pos-${row.strategy_id}-${row.security_id}-w${wave}`)
                                    }
                                    emptyTitle="No legs"
                                  />
                                )}
                                {waveLegs.map((leg, i) => {
                                  const id = `pos-${leg.strategy_id}-${leg.security_id}-w${wave}`;
                                  return expandedRow === id ? (
                                    <div key={`${id}-${i}`}>{renderExpandedDetail(leg)}</div>
                                  ) : null;
                                })}
                              </div>
                            );
                          })}
                          {waveGroups.untagged.length > 0 ? (
                            <div>
                              <div className="mb-1 font-mono text-xs text-amber-400/90">
                                {nfS010UntaggedSectionLabel()} · {waveGroups.untagged.length} leg
                                {waveGroups.untagged.length === 1 ? '' : 's'}
                              </div>
                              <DeskTable
                                data={waveGroups.untagged}
                                columns={posLegColumns}
                                getRowId={(row, i) => `${row.strategy_id}-${row.security_id}-untagged-${i}`}
                                getRowClassName={(row) => positionLegRowClass(row)}
                                density="default"
                                onRowClick={(row) =>
                                  toggleExpand(`pos-${row.strategy_id}-${row.security_id}-untagged`)
                                }
                                emptyTitle="No legs"
                              />
                              {waveGroups.untagged.map((leg, i) => {
                                const id = `pos-${leg.strategy_id}-${leg.security_id}-untagged`;
                                return expandedRow === id ? (
                                  <div key={`${id}-${i}`}>{renderExpandedDetail(leg)}</div>
                                ) : null;
                              })}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <>
                          <DeskTable
                            data={legs}
                            columns={posLegColumns}
                            getRowId={(row, i) => `${row.strategy_id}-${row.security_id}-${i}`}
                            getRowClassName={(row) => positionLegRowClass(row)}
                            density="default"
                            onRowClick={(row) => toggleExpand(`pos-${row.strategy_id}-${row.security_id}`)}
                            emptyTitle="No legs"
                          />
                          {legs.map((leg, i) => {
                            const id = `pos-${leg.strategy_id}-${leg.security_id}`;
                            return expandedRow === id ? <div key={i}>{renderExpandedDetail(leg)}</div> : null;
                          })}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Order History */}
      {tab === 'orders' && (
        <div className="ord-table-wrap">
          <DateNav
            datePreset={orderDatePreset}
            setDatePreset={setOrderDatePreset}
            customDate={orderCustomDate}
            setCustomDate={setOrderCustomDate}
            dateRange={orderDateRange}
            strategyFilter={strategyFilter}
            setStrategyFilter={setStrategyFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            showStatusFilter
          />
          {orderActionMsg ? (
            <div className="ord-flash ord-flash--warn mb-2 text-sm text-amber-200" role="status">
              {orderActionMsg}
            </div>
          ) : null}
          <DeskTable
            data={filteredOrders}
            columns={orderColumns}
            getRowId={(row) => row.order_id || row.execution_id || `${row.signal_id}-${row.filled_at}`}
            initialSorting={[{ id: 'time', desc: true }]}
            density="default"
            emptyTitle="No orders on this date."
            onRowClick={(row) => toggleExpand(`ord-${row.order_id}`)}
          />
          {filteredOrders.map((o) =>
            expandedRow === `ord-${o.order_id}` ? <div key={o.order_id}>{renderExpandedDetail(o)}</div> : null
          )}
        </div>
      )}

      {/* Tab 3: Closed Trades */}
      {tab === 'closed' && (
        <div className="ord-table-wrap">
          <DateNav
            datePreset={closedDatePreset}
            setDatePreset={setClosedDatePreset}
            customDate={closedCustomDate}
            setCustomDate={setClosedCustomDate}
            dateRange={closedDateRange}
            strategyFilter={strategyFilter}
            setStrategyFilter={setStrategyFilter}
          />
          <DeskTable
            data={closedWithPnl}
            columns={closedColumns}
            getRowId={(row) => row.trade_id}
            density="default"
            emptyTitle="No trades executed on this date."
            onRowClick={(row) => toggleExpand(`cl-${row.trade_id}`)}
          />
          {closedWithPnl.map((t) =>
            expandedRow === `cl-${t.trade_id}` ? <div key={t.trade_id}>{renderExpandedDetail(t)}</div> : null
          )}
        </div>
      )}
    </div>
  );
}
