import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { toISTTime, toIST } from '../utils/formatIST';
import { formatCfgExpiry, getContractMultiplier } from '../utils/manualTradeHelpers';
import MTMChart from '../components/MTMChart';
import PayoffGraph from '../components/PayoffGraph';
import { DeskTable } from '../components/DeskTable';
import { PositionLegBadge } from '../components/PositionLegBadge';
import { SquareOffLegDialog } from '../components/SquareOffLegDialog';
import { Skeleton } from '../components/ui/Skeleton';

import { useApiPoll } from '../hooks/useApiPoll';
import { positionLegRowClass } from '../lib/positionLeg';
import { getStrategyDisplayName, strategyMatchesSearch } from '../lib/strategyDisplayNames';
import {
  NF_S0_10_ID,
  NF_S0_10_WAVES,
  groupNfS010Positions,
  nfS010UntaggedSectionLabel,
  nfS010WaveSectionLabel,
} from '../lib/strategyWaveUi';
import { useDeskShell } from '../context/DeskShellContext';
import { cn } from '../lib/utils';
import { apiBrokerId, getDeskBookConfig } from '../config/deskProfile';
import { API, RMS_API } from '../config/deskApi';
import {
  baseCapitalDeployed,
  dteFromExpiry,
  marginPerLotForDte,
} from '../lib/baseCapital';

const DESK_BOOK = getDeskBookConfig();
const TABS = ['PnL Table', 'MTM Chart', 'Payoff'];

const cleanName = (id) => getStrategyDisplayName(id);

/** YYYY-MM-DD for "today" in IST. */
function todayISTDateStr() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function pnlColor(val) {
  if (val > 0) return 'green';
  if (val < 0) return 'red';
  return '';
}

const FALLBACK_PNL = { ts: null, realized_pnl: 0, unrealized_pnl: 0, strategies: {} };
const LOAD_TIMEOUT_MS = 12_000;
/** Strategy configs + symbol master change rarely; keep hot poll to PnL + positions only. */
const STATIC_FETCH_INTERVAL_MS = 60_000;

const PNL_STRATEGY_TABLE_SORT = [{ id: 'symbol', desc: false }];

function formatCapitalPct(pct) {
  if (pct == null || Number.isNaN(pct)) return '—';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

export default function PnL() {
  const { connected, reconnecting, pipelineOk, lastMessage } = useDeskShell();
  const [broker, setBroker] = useState(DESK_BOOK.broker);
  const [data, setData] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [symbols, setSymbols] = useState([]);
  const [rmsStrategies, setRmsStrategies] = useState({});
  const [positions, setPositions] = useState([]);
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [pnlError, setPnlError] = useState(null);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [tableSearch, setTableSearch] = useState('');
  const [includedStrategyIds, setIncludedStrategyIds] = useState(null);
  const [strategyMenuOpen, setStrategyMenuOpen] = useState(false);
  const strategyPickerRef = useRef(null);
  const [legMsg, setLegMsg] = useState(null);
  const [legBusy, setLegBusy] = useState(null);
  const [squareOffConfirmRow, setSquareOffConfirmRow] = useState(null);

  const brokerParam = DESK_BOOK.locked ? DESK_BOOK.broker : apiBrokerId(broker);

  const staticFetchedAtRef = useRef(0);
  const prevBrokerParamRef = useRef(brokerParam);

  useEffect(() => {
    setSquareOffConfirmRow(null);
  }, [broker]);

  useEffect(() => {
    setLegMsg(null);
    setLegBusy(null);
    setSquareOffConfirmRow(null);
  }, [selectedStrategy]);

  const load = useCallback(() => {
    setPnlError(null);
    const brokerChanged = prevBrokerParamRef.current !== brokerParam;
    prevBrokerParamRef.current = brokerParam;

    const pnlQ = brokerParam ? `?broker=${brokerParam}` : '';
    fetch(`${API}/pnl${pnlQ}`)
      .then((r) => {
        if (!r.ok) throw new Error(`PnL API ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setPnlError(null);
      })
      .catch((err) => {
        setPnlError(err?.message || 'Failed to load PnL');
        setData((prev) => prev ?? FALLBACK_PNL);
      });

    const now = Date.now();
    const needStatic =
      brokerChanged ||
      staticFetchedAtRef.current === 0 ||
      now - staticFetchedAtRef.current >= STATIC_FETCH_INTERVAL_MS;
    if (needStatic) {
      staticFetchedAtRef.current = now;
      fetch(`${API}/strategy-configs`)
        .then((r) => r.json())
        .then((d) => setConfigs(d.configs || []))
        .catch(() => {});
      fetch(`${API}/symbols`)
        .then((r) => r.json())
        .then((d) => setSymbols(d.symbols || []))
        .catch(() => {});
      fetch(`${RMS_API}/config`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setRmsStrategies(d?.strategies || {}))
        .catch(() => setRmsStrategies({}));
    }

    const posQ = brokerParam ? `?broker=${brokerParam}` : '';
    fetch(`${API}/positions${posQ}`)
      .then((r) => r.json())
      .then((d) => setPositions(
        (d.positions || []).map((p) => ({
          ...p,
          avg_price: p?.avg_price != null && p?.avg_price !== ''
            ? Number(Number(p.avg_price).toFixed(2))
            : p?.avg_price,
        })),
      ))
      .catch(() => {});
  }, [brokerParam]);

  const legRowKey = (row) =>
    `${row.strategy_id}|${row.security_id}|${row.broker_id || 'mock'}`;

  const squareOffLeg = useCallback(
    async (row) => {
      if (brokerParam !== 'dhan_sandbox' && brokerParam !== 'kotak_sandbox') {
        setLegMsg('Square off is only available on the live desk.');
        return false;
      }
      const k = `sq:${legRowKey(row)}`;
      setLegBusy(k);
      setLegMsg(null);
      try {
        const r = await fetch(
          `${RMS_API}/strategies/${encodeURIComponent(row.strategy_id)}/squareoff-leg`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ security_id: row.security_id, broker_id: row.broker_id }),
          }
        );
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          const d = j.detail;
          const msg =
            typeof d === 'string'
              ? d
              : Array.isArray(d)
                ? d.map((x) => (x.msg != null ? x.msg : JSON.stringify(x))).join('; ')
                : r.statusText;
          throw new Error(msg || 'Square-off failed');
        }
        setLegMsg('Square-off sent — watch Orders / broker app.');
        load();
        return true;
      } catch (e) {
        setLegMsg(e.message || 'Square-off failed');
        return false;
      } finally {
        setLegBusy((b) => (b === k ? null : b));
      }
    },
    [brokerParam, load]
  );

  const confirmSquareOffLeg = useCallback(async () => {
    if (!squareOffConfirmRow) return;
    const ok = await squareOffLeg(squareOffConfirmRow);
    if (ok) setSquareOffConfirmRow(null);
  }, [squareOffConfirmRow, squareOffLeg]);

  const dismissLeg = useCallback(async (row) => {
    if (!row.id) {
      setLegMsg('Missing position id — refresh the page.');
      return;
    }
    if (
      !window.confirm(
        'Remove this row from the desk book? Only if you already closed this leg at the broker.'
      )
    ) {
      return;
    }
    const k = `ds:${legRowKey(row)}`;
    setLegBusy(k);
    setLegMsg(null);
    try {
      const r = await fetch(`${API}/positions/dismiss-external-close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, confirm: 'CLOSED_EXTERNALLY' }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const d = j.detail;
        const msg = typeof d === 'string' ? d : r.statusText;
        throw new Error(msg || 'Dismiss failed');
      }
      setLegMsg('Book row removed.');
      load();
    } catch (e) {
      setLegMsg(e.message || 'Dismiss failed');
    } finally {
      setLegBusy((b) => (b === k ? null : b));
    }
  }, [load]);

  useEffect(() => {
    const slowTimer = setTimeout(() => setLoadingSlow(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(slowTimer);
  }, [load]);

  useApiPoll(load, 1000, true, [brokerParam]);

  useEffect(() => {
    if (!lastMessage || lastMessage.type !== 'pnl_snapshot' || !lastMessage.payload) return;
    const deskBroker = DESK_BOOK.broker;
    if (brokerParam !== deskBroker) return;
    const payloadBroker = lastMessage.payload.broker;
    if (
      payloadBroker != null &&
      String(payloadBroker).trim() !== '' &&
      apiBrokerId(payloadBroker) !== brokerParam
    ) {
      return;
    }
    setData(lastMessage.payload);
    setPnlError(null);
  }, [lastMessage, brokerParam]);

  useEffect(() => {
    if (data) setLoadingSlow(false);
  }, [data]);

  const symbolFor = useCallback(
    (sid) => {
      const cfg = configs.find((c) => c.strategy_id === sid);
      if (!cfg || cfg.underlying_scrip == null) return '—';
      const scrip = cfg.underlying_scrip;
      const sym = symbols.find((s) => s.security_id === scrip);
      return sym ? sym.display_name || sym.symbol_name : scrip;
    },
    [configs, symbols]
  );

  const strategies = useMemo(() => data?.strategies || {}, [data]);
  const strategyIds = Object.keys(strategies);
  const strategyCount = strategyIds.length;

  const bookRealized = data?.realized_pnl ?? 0;
  const bookUnrealized = data?.unrealized_pnl ?? 0;
  const bookTotal = bookRealized + bookUnrealized;

  const lotByStrategy = useMemo(() => {
    const out = {};
    for (const [sid, row] of Object.entries(rmsStrategies || {})) {
      const cfg = configs.find((c) => c.strategy_id === sid);
      const underlying = Number(cfg?.underlying_scrip ?? 13);
      const mult = getContractMultiplier(underlying, symbols);
      if (row != null && row.lot_size != null && row.lot_size !== '') {
        out[sid] = Math.max(1, Number(row.lot_size) || 1);
      } else if (row?.order_quantity) {
        out[sid] = Math.max(1, Math.round(Number(row.order_quantity) / mult) || 1);
      } else {
        out[sid] = 1;
      }
    }
    return out;
  }, [rmsStrategies, configs, symbols]);

  const capitalPct = useMemo(() => {
    const empty = { t: null, r: null, u: null };
    const ids = Object.keys(strategies);
    if (!ids.length) return empty;

    const today = todayISTDateStr();
    const expiryByStrategy = {};
    for (const pos of positions || []) {
      const sid = pos?.strategy_id;
      if (!sid || expiryByStrategy[sid]) continue;
      const exp = formatCfgExpiry(pos.expiry);
      if (exp) expiryByStrategy[sid] = exp;
    }

    let bookBaseCapital = 0;
    for (const sid of ids) {
      const cfg = configs.find((c) => c.strategy_id === sid);
      const expiry = expiryByStrategy[sid] || formatCfgExpiry(cfg?.expiry) || '';
      const dte = dteFromExpiry(expiry, today);
      const margin = marginPerLotForDte(dte);
      const lots = lotByStrategy[sid] ?? 1;
      const capital = baseCapitalDeployed(lots, margin);
      if (capital == null) return empty;
      bookBaseCapital += capital;
    }

    if (bookBaseCapital <= 0) return empty;
    return {
      t: (bookTotal / bookBaseCapital) * 100,
      r: (bookRealized / bookBaseCapital) * 100,
      u: (bookUnrealized / bookBaseCapital) * 100,
    };
  }, [
    strategies,
    positions,
    configs,
    lotByStrategy,
    bookTotal,
    bookRealized,
    bookUnrealized,
  ]);

  const strategyRows = useMemo(() => {
    const strats = data?.strategies || {};
    return Object.keys(strats).map((sid) => ({
      strategy_id: sid,
      ...strats[sid],
    }));
  }, [data]);

  const strategyRowsKey = useMemo(
    () => strategyRows.map((r) => r.strategy_id).sort().join('|'),
    [strategyRows]
  );

  const enrichedStrategyRows = useMemo(
    () =>
      strategyRows.map((row) => {
        const cfg = configs.find((c) => c.strategy_id === row.strategy_id);
        const expiryLabel = formatCfgExpiry(cfg?.expiry) || '';
        return {
          ...row,
          symbolLabel: symbolFor(row.strategy_id),
          expiryLabel,
          underlyingScrip: cfg?.underlying_scrip ?? null,
        };
      }),
    [strategyRows, configs, symbolFor]
  );

  useEffect(() => {
    setIncludedStrategyIds((prev) => {
      if (!strategyRowsKey) return null;
      if (prev == null) return null;
      const valid = new Set(strategyRowsKey.split('|'));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      if (next.size === 0) return null;
      if (next.size === valid.size) return null;
      return next;
    });
  }, [strategyRowsKey]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!strategyPickerRef.current?.contains(e.target)) setStrategyMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setStrategyMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (strategyRows.length === 0) setStrategyMenuOpen(false);
  }, [strategyRows.length]);

  const filteredStrategyRows = useMemo(() => {
    let rows = enrichedStrategyRows;
    const q = tableSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        return (
          r.symbolLabel.toLowerCase().includes(q) ||
          r.expiryLabel.toLowerCase().includes(q) ||
          strategyMatchesSearch(r.strategy_id, q)
        );
      });
    }
    if (includedStrategyIds != null) {
      rows = rows.filter((r) => includedStrategyIds.has(r.strategy_id));
    }
    return rows;
  }, [enrichedStrategyRows, tableSearch, includedStrategyIds]);

  const filteredFooterSums = useMemo(() => {
    let realized = 0;
    let unrealized = 0;
    let total = 0;
    filteredStrategyRows.forEach((row) => {
      realized += Number(row.realized) || 0;
      unrealized += Number(row.unrealized) || 0;
      total += Number(row.total) || 0;
    });
    return { realized, unrealized, total };
  }, [filteredStrategyRows]);

  const strategyDdLabel = useMemo(() => {
    if (strategyRows.length === 0) return 'No strategies';
    if (includedStrategyIds == null) return 'All strategies';
    const n = includedStrategyIds.size;
    if (n === 0) return 'None selected';
    if (n <= 2) return [...includedStrategyIds].map((id) => cleanName(id)).join(', ');
    return `${n} strategies selected`;
  }, [strategyRows.length, includedStrategyIds]);

  const filtersActive = useMemo(() => {
    if (tableSearch.trim().length > 0) return true;
    if (includedStrategyIds != null) return true;
    return false;
  }, [tableSearch, includedStrategyIds]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (tableSearch.trim().length > 0) n += 1;
    if (includedStrategyIds != null) n += 1;
    return n;
  }, [tableSearch, includedStrategyIds]);

  const resetFilters = useCallback(() => {
    setTableSearch('');
    setIncludedStrategyIds(null);
    setStrategyMenuOpen(false);
  }, []);

  const toggleStrategyInclusion = useCallback((sid) => {
    setIncludedStrategyIds((prev) => {
      const allIds = strategyRows.map((r) => r.strategy_id);
      const allSet = new Set(allIds);
      if (prev == null) {
        const next = new Set(allIds);
        next.delete(sid);
        return next.size === 0 ? new Set() : next;
      }
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      if (next.size === allSet.size) return null;
      return next;
    });
  }, [strategyRows]);

  const selectAllStrategiesInclusion = useCallback(() => setIncludedStrategyIds(null), []);
  const clearAllStrategiesInclusion = useCallback(() => setIncludedStrategyIds(new Set()), []);

  const isStrategyIncluded = useCallback(
    (sid) => includedStrategyIds == null || includedStrategyIds.has(sid),
    [includedStrategyIds]
  );

  useEffect(() => {
    if (!selectedStrategy) return;
    const visible = filteredStrategyRows.some((r) => r.strategy_id === selectedStrategy);
    if (!visible) setSelectedStrategy(null);
  }, [selectedStrategy, filteredStrategyRows]);

  const strategyColumns = useMemo(
    () => [
      {
        accessorKey: 'strategy_id',
        header: 'Strategy',
        cell: ({ getValue }) => <span className="strategy-name font-medium">{cleanName(getValue())}</span>,
      },
      {
        id: 'symbol',
        accessorFn: (row) => row.symbolLabel,
        header: 'Symbol',
        cell: ({ row }) => row.original.symbolLabel,
      },
      {
        accessorKey: 'realized',
        header: 'Realised PnL',
        meta: { numeric: true },
        cell: ({ getValue }) => (
          <span className={pnlColor(Number(getValue()))}>{Number(getValue()).toFixed(2)}</span>
        ),
      },
      {
        accessorKey: 'unrealized',
        header: 'Unrealised PnL',
        meta: { numeric: true },
        cell: ({ getValue }) => (
          <span className={pnlColor(Number(getValue()))}>{Number(getValue()).toFixed(2)}</span>
        ),
      },
      {
        accessorKey: 'total',
        header: 'Total PnL',
        meta: { numeric: true },
        cell: ({ getValue }) => (
          <span className={pnlColor(Number(getValue()))}>{Number(getValue()).toFixed(2)}</span>
        ),
      },
      {
        id: '_expand',
        enableSorting: false,
        header: '',
        cell: ({ row }) => (
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-desk-muted transition-transform duration-150',
              selectedStrategy === row.original.strategy_id && 'rotate-90 text-[color:var(--accent)]'
            )}
            aria-hidden
          />
        ),
      },
    ],
    [selectedStrategy]
  );

  const positionsForStrategy = selectedStrategy
    ? positions.filter((p) => p.strategy_id === selectedStrategy)
    : [];

  const nfWaveGroups = useMemo(
    () =>
      selectedStrategy === NF_S0_10_ID
        ? groupNfS010Positions(positionsForStrategy)
        : null,
    [selectedStrategy, positionsForStrategy]
  );

  const squareOffDialogBusy =
    squareOffConfirmRow != null && legBusy === `sq:${legRowKey(squareOffConfirmRow)}`;

  const positionColumns = useMemo(
    () => [
      {
        id: 'leg',
        header: 'Leg',
        cell: ({ row }) => <PositionLegBadge position={row.original} />,
      },
      {
        id: 'stale',
        header: '',
        cell: ({ row }) =>
          row.original.stale_exit_pending ? (
            <span
              className="rounded px-1.5 py-0.5 text-[0.65rem] font-medium bg-amber-500/20 text-amber-400"
              title={row.original.stale_exit_since || 'EXIT pending over 5 minutes'}
            >
              Stale
            </span>
          ) : null,
      },
      { accessorKey: 'underlying', header: 'Underlying', cell: ({ getValue }) => getValue() || '—' },
      { accessorKey: 'expiry', header: 'Expiry', cell: ({ getValue }) => getValue() || '—' },
      {
        accessorKey: 'strike',
        header: 'Strike',
        meta: { numeric: true },
        cell: ({ getValue }) => getValue() ?? '—',
      },
      { accessorKey: 'option_type', header: 'Type', cell: ({ getValue }) => getValue() || '—' },
      { accessorKey: 'side', header: 'Side', cell: ({ getValue }) => getValue() },
      {
        accessorKey: 'quantity',
        header: 'Qty',
        meta: { numeric: true },
        cell: ({ getValue }) => getValue(),
      },
      {
        accessorKey: 'avg_price',
        header: 'Avg price',
        meta: { numeric: true },
        cell: ({ getValue }) => {
          const value = getValue();
          return value != null && value !== '' ? Number(value).toFixed(2) : '—';
        },
      },
      {
        accessorKey: 'unrealized_pnl',
        header: 'Live PnL',
        meta: { numeric: true },
        cell: ({ getValue }) =>
          getValue() != null ? (
            <span className={pnlColor(Number(getValue()))}>{Number(getValue()).toFixed(2)}</span>
          ) : (
            '—'
          ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const rk = legRowKey(row.original);
          const sqBusy = legBusy === `sq:${rk}`;
          const dsBusy = legBusy === `ds:${rk}`;
          const btnBase =
            'inline-flex min-h-[2rem] items-center justify-center rounded-desk-sm px-3 py-1.5 text-[0.75rem] font-semibold tracking-wide transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--desk-bg,#0f1419)] disabled:cursor-not-allowed disabled:opacity-55 active:scale-[0.97]';
          return (
            <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {brokerParam === 'dhan_sandbox' || brokerParam === 'kotak_sandbox' ? (
                <button
                  type="button"
                  disabled={!!legBusy}
                  aria-busy={sqBusy}
                  className={`${btnBase} border border-orange-500/70 bg-orange-600/90 text-white shadow-md shadow-orange-900/40 hover:bg-orange-500 hover:shadow-lg hover:shadow-orange-800/30 focus-visible:ring-orange-400`}
                  onClick={() => setSquareOffConfirmRow(row.original)}
                >
                  {sqBusy ? 'Sending…' : 'Square off'}
                </button>
              ) : null}
              <button
                type="button"
                disabled={!!legBusy}
                aria-busy={dsBusy}
                className={`${btnBase} border-2 border-amber-500/80 bg-amber-950/50 text-amber-100 hover:bg-amber-900/60 focus-visible:ring-amber-400`}
                onClick={() => dismissLeg(row.original)}
              >
                {dsBusy ? 'Working…' : 'Dismiss book'}
              </button>
            </div>
          );
        },
      },
      { accessorKey: 'opened_at', header: 'Opened at', cell: ({ getValue }) => toIST(getValue()) },
    ],
    [dismissLeg, brokerParam, legBusy]
  );

  if (!data) {
    return (
      <div className="card pnl-page pnl-page--inst">
        <Skeleton className="mb-3 h-6 w-48 rounded-desk-sm" />
        <div className="mb-3 grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-desk-sm" />
          ))}
        </div>
        <Skeleton className="h-48 w-full rounded-desk-sm" />
        {loadingSlow && (
          <p className="mt-2 text-xs text-amber-400/80">
            Taking longer than usual. Is the backend running?{' '}
            <button type="button" className="underline" onClick={load}>
              Retry
            </button>
          </p>
        )}
      </div>
    );
  }

  const errorBanner = pnlError && (
    <div className="pnl-alert--error" role="alert">
      <span>{pnlError}</span>
      <button type="button" className="rounded-desk-sm border border-white/20 px-2 py-1 text-sm hover:bg-white/10" onClick={load}>
        Retry
      </button>
    </div>
  );

  return (
    <div className="card pnl-page pnl-page--inst">
      <header className="pnl-hero">
        <div className="pnl-hero__titles">
          <h1>Profit &amp; Loss</h1>
          <p className="pnl-hero__subtitle">Live book · strategy attribution · session deltas</p>
        </div>
        <div className="pnl-hero__controls">
          <div className="pnl-env-seg" role="group" aria-label="Execution environment">
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
          <div className="pnl-hero__meta">
            <span className="inline-flex items-center gap-1">
              <span
                className={connected ? 'inline-block h-1.5 w-1.5 rounded-full bg-emerald-500' : 'inline-block h-1.5 w-1.5 rounded-full bg-red-500'}
              />
              Feed {connected ? 'live' : reconnecting ? 'reconn' : 'off'}
            </span>
            <span className="text-desk-muted">·</span>
            <span className={pipelineOk ? 'text-emerald-400' : 'text-amber-400'}>
              {pipelineOk ? 'Desk OK' : 'Check desk'}
            </span>
            <span className="text-desk-muted">·</span>
            <span>
              Sync <time dateTime={data.ts || undefined}>{data.ts ? toISTTime(data.ts) : '—'}</time>
            </span>
          </div>
        </div>
      </header>

      <section className="pnl-desk-tape" aria-label="Book snapshot">
        <div className="pnl-desk-tape__scroll">
          <span className="pnl-desk-tape__chip pnl-desk-tape__chip--accent">
            {DESK_BOOK.bookChip} book
          </span>
          <span className="pnl-desk-tape__metric">
            <span className="pnl-desk-tape__k">Total</span>
            <span className={cn('pnl-desk-tape__v', pnlColor(bookTotal))}>
              ₹{bookTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </span>
          <span className="pnl-desk-tape__metric">
            <span className="pnl-desk-tape__k">Realised</span>
            <span className={cn('pnl-desk-tape__v', pnlColor(bookRealized))}>
              ₹{bookRealized.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </span>
          <span className="pnl-desk-tape__metric">
            <span className="pnl-desk-tape__k">Unrealised</span>
            <span className={cn('pnl-desk-tape__v', pnlColor(bookUnrealized))}>
              ₹{bookUnrealized.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </span>
          <span className="pnl-desk-tape__metric">
            <span className="pnl-desk-tape__k">Strategies</span>
            <span className="pnl-desk-tape__v" style={{ color: 'var(--text)' }}>
              {strategyCount}
            </span>
          </span>
          <span className="pnl-desk-tape__metric pnl-desk-tape__metric--mono">
            <span className="pnl-desk-tape__k">Mark</span>
            <span className="pnl-desk-tape__v">{data.ts ? toISTTime(data.ts) : '—'}</span>
          </span>
        </div>
      </section>

      {errorBanner}

      <div className="pnl-tabs-pills" role="tablist" aria-label="PnL views">
        {TABS.map((t, i) => (
          <button key={t} type="button" role="tab" aria-selected={activeTab === i} className={activeTab === i ? 'active' : ''} onClick={() => setActiveTab(i)}>
            {t}
          </button>
        ))}
      </div>

      {activeTab === 0 && (
        <>
          <section className="pnl-kpi-inst" aria-label="Book summary">
            <div className="pnl-kpi-inst__card pnl-kpi-inst__card--hero">
              <div className="pnl-kpi-inst__label">Total PnL</div>
              <div className={cn('pnl-kpi-inst__value', pnlColor(bookTotal))}>₹{bookTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className={cn('pnl-kpi-inst__delta', capitalPct.t != null && capitalPct.t >= 0 ? 'pnl-kpi-inst__delta--up' : capitalPct.t != null && capitalPct.t < 0 ? 'pnl-kpi-inst__delta--down' : '')}>
                {capitalPct.t != null ? <>{capitalPct.t >= 0 ? '↑' : '↓'} {formatCapitalPct(capitalPct.t)}</> : '—'}
              </div>
            </div>
            <div className="pnl-kpi-inst__card">
              <div className="pnl-kpi-inst__label">Realised</div>
              <div className={cn('pnl-kpi-inst__value', pnlColor(bookRealized))}>₹{bookRealized.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className={cn('pnl-kpi-inst__delta', capitalPct.r != null && capitalPct.r >= 0 ? 'pnl-kpi-inst__delta--up' : capitalPct.r != null && capitalPct.r < 0 ? 'pnl-kpi-inst__delta--down' : '')}>
                {capitalPct.r != null ? <>{capitalPct.r >= 0 ? '↑' : '↓'} {formatCapitalPct(capitalPct.r)}</> : '—'}
              </div>
            </div>
            <div className="pnl-kpi-inst__card">
              <div className="pnl-kpi-inst__label">Unrealised</div>
              <div className={cn('pnl-kpi-inst__value', pnlColor(bookUnrealized))}>₹{bookUnrealized.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className={cn('pnl-kpi-inst__delta', capitalPct.u != null && capitalPct.u >= 0 ? 'pnl-kpi-inst__delta--up' : capitalPct.u != null && capitalPct.u < 0 ? 'pnl-kpi-inst__delta--down' : '')}>
                {capitalPct.u != null ? <>{capitalPct.u >= 0 ? '↑' : '↓'} {formatCapitalPct(capitalPct.u)}</> : '—'}
              </div>
            </div>
            <div className="pnl-kpi-inst__card">
              <div className="pnl-kpi-inst__label">Strategies</div>
              <div className="pnl-kpi-inst__value" style={{ color: 'var(--text)' }}>{strategyCount}</div>
              <div className="pnl-kpi-inst__delta">in book</div>
            </div>
          </section>

          <div className="pnl-toolbar">
            <input
              type="search"
              className="pnl-filter-search"
              placeholder="Search…"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              aria-label="Filter table"
            />
            <div className="mt-strategy-dd pnl-filter-strategy-dd" ref={strategyPickerRef}>
              <button
                type="button"
                className="mt-strategy-dd__trigger"
                aria-haspopup="true"
                aria-expanded={strategyMenuOpen}
                disabled={strategyRows.length === 0}
                onClick={() => setStrategyMenuOpen((o) => !o)}
              >
                <span className="mt-strategy-dd__value">{strategyDdLabel}</span>
                <span className={`mt-strategy-dd__chev ${strategyMenuOpen ? 'mt-strategy-dd__chev--open' : ''}`} aria-hidden />
              </button>
              {strategyMenuOpen && strategyRows.length > 0 && (
                <div className="mt-strategy-dd__panel" role="group" aria-label="Choose strategies">
                  <div className="mt-strategy-dd__toolbar">
                    <button type="button" className="mt-btn-text" onClick={selectAllStrategiesInclusion}>
                      All
                    </button>
                    <button type="button" className="mt-btn-text" onClick={clearAllStrategiesInclusion}>
                      None
                    </button>
                  </div>
                  <div className="mt-strategy-dd__list">
                    {enrichedStrategyRows.map((row) => {
                      const sid = row.strategy_id;
                      const checked = isStrategyIncluded(sid);
                      return (
                        <label key={sid} className={`mt-strategy-row ${checked ? 'mt-strategy-row--on' : ''}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleStrategyInclusion(sid)} />
                          <span className="mt-strategy-id">{cleanName(sid)}</span>
                          <span className="mt-strategy-sym">{row.symbolLabel}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {activeFilterCount > 0 && <span className="pnl-filter-badge">{activeFilterCount}</span>}
            <button type="button" className="pnl-btn-reset" onClick={resetFilters} disabled={!filtersActive}>
              Reset
            </button>
          </div>

          <div className="pnl-table-shell">
            <DeskTable
              data={filteredStrategyRows}
              columns={strategyColumns}
              getRowId={(row) => row.strategy_id}
              initialSorting={PNL_STRATEGY_TABLE_SORT}
              density="default"
              emptyTitle={strategyRows.length === 0 ? 'No PnL data yet' : 'No strategies match filters'}
              onRowClick={(row) =>
                setSelectedStrategy((prev) => (prev === row.strategy_id ? null : row.strategy_id))
              }
              getRowClassName={(row) => (selectedStrategy === row.strategy_id ? 'selected' : '')}
              footer={
                filteredStrategyRows.length > 0 ? (
                  <tr className="total-row h-10">
                    <td colSpan={2} className="border-b border-desk-border px-3 py-2 text-left font-mono text-sm text-desk-text">
                      <strong>Total (visible)</strong>
                    </td>
                    <td className={`border-b border-desk-border px-3 py-2 text-right font-mono text-sm tabular-nums ${pnlColor(filteredFooterSums.realized)}`}>
                      <strong>{filteredFooterSums.realized.toFixed(2)}</strong>
                    </td>
                    <td className={`border-b border-desk-border px-3 py-2 text-right font-mono text-sm tabular-nums ${pnlColor(filteredFooterSums.unrealized)}`}>
                      <strong>{filteredFooterSums.unrealized.toFixed(2)}</strong>
                    </td>
                    <td className={`border-b border-desk-border px-3 py-2 text-right font-mono text-sm tabular-nums ${pnlColor(filteredFooterSums.total)}`}>
                      <strong>{filteredFooterSums.total.toFixed(2)}</strong>
                    </td>
                    <td className="border-b border-desk-border px-3 py-2" aria-hidden />
                  </tr>
                ) : null
              }
            />
          </div>

          {selectedStrategy && (
            <section className="open-positions-section">
              <div className="open-positions-header">
                <h3>Open positions: {cleanName(selectedStrategy)}</h3>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedStrategy(null);
                  }}
                  className="btn-close-panel"
                >
                  Close
                </button>
              </div>
              {legMsg ? (
                <p className="mb-2 text-xs text-amber-400/90" role="status">
                  {legMsg}
                </p>
              ) : null}
              {positionsForStrategy.length === 0 ? (
                <p className="no-positions">No open positions for this strategy.</p>
              ) : nfWaveGroups ? (
                <div className="space-y-3">
                  {NF_S0_10_WAVES.map((wave) => {
                    const legs = nfWaveGroups.waves[wave];
                    return (
                      <div key={wave}>
                        <h4 className="mb-1 font-mono text-xs text-desk-muted">
                          {nfS010WaveSectionLabel(wave)}
                          {legs.length ? ` · ${legs.length} leg${legs.length === 1 ? '' : 's'}` : ''}
                        </h4>
                        {legs.length === 0 ? (
                          <p className="no-positions">No open positions for this wave.</p>
                        ) : (
                          <DeskTable
                            data={legs}
                            columns={positionColumns}
                            getRowId={(row) =>
                              row.id || `${row.strategy_id}-${row.security_id}-${row.broker_id || 'mock'}-w${wave}`
                            }
                            getRowClassName={(row) => positionLegRowClass(row)}
                            emptyTitle="No positions"
                          />
                        )}
                      </div>
                    );
                  })}
                  {nfWaveGroups.untagged.length > 0 ? (
                    <div>
                      <h4 className="mb-1 font-mono text-xs text-amber-400/90">
                        {nfS010UntaggedSectionLabel()} · {nfWaveGroups.untagged.length} leg
                        {nfWaveGroups.untagged.length === 1 ? '' : 's'}
                      </h4>
                      <DeskTable
                        data={nfWaveGroups.untagged}
                        columns={positionColumns}
                        getRowId={(row) =>
                          row.id || `${row.strategy_id}-${row.security_id}-${row.broker_id || 'mock'}-untagged`
                        }
                        getRowClassName={(row) => positionLegRowClass(row)}
                        emptyTitle="No positions"
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <DeskTable
                  data={positionsForStrategy}
                  columns={positionColumns}
                  getRowId={(row) =>
                    row.id || `${row.strategy_id}-${row.security_id}-${row.broker_id || 'mock'}`
                  }
                  getRowClassName={(row) => positionLegRowClass(row)}
                  emptyTitle="No positions"
                />
              )}
            </section>
          )}

          {selectedStrategy && (
            <section className="open-positions-section">
              <div className="open-positions-header">
                <h3>Strategy analytics: {cleanName(selectedStrategy)}</h3>
                <span className="font-mono text-[0.65rem] text-[var(--accent)] tracking-wider">LIVE</span>
              </div>
              <MTMChart embedded strategyFilter={selectedStrategy} />
              <div className="mt-2">
                <PayoffGraph embedded strategyFilter={selectedStrategy} />
              </div>
            </section>
          )}

          {data.ts && <p className="pnl-footer-inst">Polling every 5s · Last tick aligned with PnL data above</p>}
        </>
      )}

      {activeTab === 1 && <MTMChart embedded date={todayISTDateStr()} />}
      {activeTab === 2 && <PayoffGraph embedded />}

      <SquareOffLegDialog
        open={squareOffConfirmRow != null}
        position={squareOffConfirmRow}
        busy={squareOffDialogBusy}
        onCancel={() => !squareOffDialogBusy && setSquareOffConfirmRow(null)}
        onConfirm={confirmSquareOffLeg}
      />
    </div>
  );
}
