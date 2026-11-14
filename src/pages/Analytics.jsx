import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import { getDeskBookConfig } from '../config/deskProfile';
import { Skeleton } from '../components/ui/Skeleton';
import MTMChart from '../components/MTMChart';
import { API } from '../config/deskApi';

import { getStrategyDisplayName as cleanName } from '../lib/strategyDisplayNames';

function ymToString(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function todayIST() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth() };
}

/** YYYY-MM-DD for "today" in IST (same offset trick as month nav). */
function todayISTDateStr() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmtINRCompact(v) {
  if (v == null) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(2)} K`;
  return `${sign}${abs.toFixed(0)}`;
}

function fmtINR(v) {
  if (v == null) return '—';
  return `${v < 0 ? '-' : ''}\u20B9${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtCompactINR(v) {
  if (v == null) return '—';
  return `${v < 0 ? '-' : ''}\u20B9${fmtINRCompact(v).replace('-', '')}`;
}

function fmtPct(v, digits = 2) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v.toFixed(digits)}%`;
}

function fmtRatio(v, digits = 2) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v.toFixed(digits)}\u00D7`;
}

function pnlColor(v) {
  if (v == null || Number.isNaN(v)) return 'text-desk-muted';
  if (v > 0) return 'text-emerald-400';
  if (v < 0) return 'text-rose-400';
  return 'text-desk-muted';
}

function pnlCellBg(v) {
  if (v == null || v === 0) return '';
  if (v > 0) return 'bg-emerald-500/8 border-emerald-500/30';
  return 'bg-rose-500/8 border-rose-500/30';
}

function Sparkline({ values, color = 'rgba(56,189,248,0.85)', height = 28, width = 92 }) {
  const pts = (values || []).filter((x) => typeof x === 'number' && !Number.isNaN(x));
  if (pts.length < 2) {
    return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} />;
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = Math.max(1e-9, max - min);
  const step = (width - 2) / (pts.length - 1);
  const d = pts
    .map((v, i) => {
      const x = 1 + i * step;
      const y = 1 + (height - 2) * (1 - (v - min) / span);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StackBar({ wins = 0, losses = 0, breakeven = 0 }) {
  const total = Math.max(1, wins + losses + breakeven);
  const w = (wins / total) * 100;
  const l = (losses / total) * 100;
  const b = (breakeven / total) * 100;
  return (
    <div className="qd-stackbar" aria-label="W/L stack">
      <span className="qd-stackbar__seg qd-stackbar__seg--w" style={{ width: `${w}%` }} />
      <span className="qd-stackbar__seg qd-stackbar__seg--l" style={{ width: `${l}%` }} />
      <span className="qd-stackbar__seg qd-stackbar__seg--b" style={{ width: `${b}%` }} />
    </div>
  );
}

function MiniBars({ pos = 0, neg = 0 }) {
  const a = Math.abs(pos || 0);
  const b = Math.abs(neg || 0);
  const max = Math.max(1e-9, a, b);
  const hp = Math.round((a / max) * 100);
  const hn = Math.round((b / max) * 100);
  return (
    <div className="qd-minibars" aria-label="Avg win/loss bars">
      <div className="qd-minibars__bar qd-minibars__bar--pos" style={{ height: `${hp}%` }} />
      <div className="qd-minibars__bar qd-minibars__bar--neg" style={{ height: `${hn}%` }} />
    </div>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function buildMonthGrid(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  const offset = (first.getUTCDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let day = 1; day <= last.getUTCDate(); day++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function Analytics() {
  const deskBook = useMemo(() => getDeskBookConfig(), []);
  const broker = deskBook.broker;

  const [{ y, m }, setYm] = useState(() => {
    const t = todayIST();
    const minMonth = deskBook.analyticsMinDate ? deskBook.analyticsMinDate.slice(0, 7) : null;
    const monthStr = ymToString(t.y, t.m);
    if (minMonth && monthStr < minMonth) {
      const [yy, mm] = minMonth.split('-').map((x) => Number(x));
      return { y: yy, m: mm - 1 };
    }
    return t;
  });
  const [rangeMode, setRangeMode] = useState('month'); // 'month' | 'custom'
  const [customFrom, setCustomFrom] = useState(() => {
    const t = todayIST();
    return `${ymToString(t.y, t.m)}-01`;
  });
  const [customTo, setCustomTo] = useState(() => todayISTDateStr());
  const [scope, setScope] = useState('overall');
  const [strategyId, setStrategyId] = useState('');
  const [strategies, setStrategies] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [dayDetail, setDayDetail] = useState(null);

  const [perTrade, setPerTrade] = useState(null);
  const [chargesEditorOpen, setChargesEditorOpen] = useState(false);
  const [perTradeDraft, setPerTradeDraft] = useState('');
  const [savingCharges, setSavingCharges] = useState(false);
  const [monthsAvg, setMonthsAvg] = useState(null);

  const monthStr = ymToString(y, m);
  const istTodayStr = todayISTDateStr();
  const analyticsMinDate = deskBook.analyticsMinDate || data?.display_min_date || null;
  const analyticsMinMonth = analyticsMinDate ? analyticsMinDate.slice(0, 7) : null;
  const isCustomRange = rangeMode === 'custom';
  const periodLabel = isCustomRange ? 'this period' : 'this month';

  useEffect(() => {
    if (!analyticsMinMonth || monthStr >= analyticsMinMonth) return;
    const [yy, mm] = analyticsMinMonth.split('-').map((x) => Number(x));
    setYm({ y: yy, m: mm - 1 });
  }, [analyticsMinMonth, monthStr]);

  const loadBrokerCharges = useCallback(() => {
    fetch(`${API}/finance/broker-charges`)
      .then((r) => {
        if (!r.ok) throw new Error(`broker-charges ${r.status}`);
        return r.json();
      })
      .then((j) => setPerTrade(typeof j.per_trade === 'number' ? j.per_trade : Number(j.per_trade)))
      .catch(() => setPerTrade(null));
  }, []);

  const loadPeriod = useCallback(() => {
    if (scope === 'strategy' && !strategyId.trim()) {
      setLoading(false);
      setError(null);
      setData(null);
      return;
    }
    if (isCustomRange) {
      if (!customFrom || !customTo) {
        setError('Pick both From and To dates');
        return;
      }
      if (customFrom > customTo) {
        setError('From date must be on or before To date');
        return;
      }
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ scope, broker });
    if (isCustomRange) {
      params.set('date_from', customFrom);
      params.set('date_to', customTo);
    } else {
      params.set('month', monthStr);
    }
    if (scope === 'strategy' && strategyId) params.set('strategy_id', strategyId);
    fetch(`${API}/analytics/pnl?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Analytics API ${r.status}`);
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message || 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [monthStr, scope, strategyId, broker, isCustomRange, customFrom, customTo]);

  useEffect(() => {
    loadPeriod();
  }, [loadPeriod]);

  useEffect(() => {
    loadBrokerCharges();
  }, [loadBrokerCharges]);

  useEffect(() => {
    if (scope === 'strategy' && !strategyId.trim()) {
      setMonthsAvg(null);
      return undefined;
    }
    let alive = true;
    const params = new URLSearchParams({ months: '12', scope, broker });
    if (scope === 'strategy' && strategyId) params.set('strategy_id', strategyId);
    fetch(`${API}/analytics/months?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j) setMonthsAvg(j);
      })
      .catch(() => {
        if (alive) setMonthsAvg(null);
      });
    return () => {
      alive = false;
    };
  }, [scope, strategyId, broker]);

  useEffect(() => {
    fetch(`${API}/strategies`)
      .then((r) => r.json())
      .then((d) => setStrategies(d.strategies || []))
      .catch(() => setStrategies([]));
  }, []);

  useEffect(() => {
    if (!selectedDate) {
      setDayDetail(null);
      return undefined;
    }
    let alive = true;
    fetch(`${API}/analytics/day?date=${encodeURIComponent(selectedDate)}&broker=${encodeURIComponent(broker)}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setDayDetail(d);
      })
      .catch(() => {
        if (alive) setDayDetail(null);
      });
    return () => {
      alive = false;
    };
  }, [selectedDate, broker]);

  const sortedDayStrategies = useMemo(() => {
    const rows = dayDetail?.strategies || [];
    return [...rows].sort((a, b) => Math.abs(b?.net_pnl || 0) - Math.abs(a?.net_pnl || 0));
  }, [dayDetail]);

  const savePerTrade = async () => {
    const n = Number(perTradeDraft);
    if (Number.isNaN(n) || n < 0) {
      setError('₹ / lot / trade must be a non-negative number');
      return;
    }
    setSavingCharges(true);
    setError(null);
    try {
      const r = await fetch(`${API}/finance/broker-charges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ per_trade: n, broker }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setPerTrade(typeof j.per_trade === 'number' ? j.per_trade : n);
      setChargesEditorOpen(false);
      loadPeriod();
      if (selectedDate) {
        const d = await fetch(
          `${API}/analytics/day?date=${encodeURIComponent(selectedDate)}&broker=${encodeURIComponent(broker)}`
        ).then((x) => x.json());
        setDayDetail(d);
      }
    } catch (e) {
      setError(`Save charges failed: ${e.message}`);
    } finally {
      setSavingCharges(false);
    }
  };

  const dayMap = useMemo(() => {
    const out = new Map();
    (data?.days || []).forEach((d) => out.set(d.ist_date, d));
    return out;
  }, [data]);

  const derived = useMemo(() => {
    const days = [...(data?.days || [])].sort((a, b) => (a.ist_date || '').localeCompare(b.ist_date || ''));
    let cum = 0;
    let peak = 0;
    let maxAbsNet = 0;
    const equity = [];
    const dist = [];
    const netSeries = [];
    for (const d of days) {
      const net = Number(d.net_pnl || 0);
      cum += net;
      peak = Math.max(peak, cum);
      const dd = peak - cum;
      maxAbsNet = Math.max(maxAbsNet, Math.abs(net));
      equity.push({ date: d.ist_date, day: Number((d.ist_date || '').slice(8, 10)), net, cum, dd });
      dist.push({ date: d.ist_date, day: Number((d.ist_date || '').slice(8, 10)), net });
      netSeries.push(net);
    }
    return { days, equity, dist, maxAbsNet, netSeries };
  }, [data]);

  const cells = useMemo(() => buildMonthGrid(y, m), [y, m]);

  const monthLabel = useMemo(() => {
    return new Date(Date.UTC(y, m, 1)).toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }, [y, m]);

  const canGoPrevMonth = !analyticsMinMonth || monthStr > analyticsMinMonth;

  const goPrev = () => {
    if (!canGoPrevMonth) return;
    setYm(({ y: yy, m: mm }) => (mm === 0 ? { y: yy - 1, m: 11 } : { y: yy, m: mm - 1 }));
  };
  const goNext = () => setYm(({ y: yy, m: mm }) => (mm === 11 ? { y: yy + 1, m: 0 } : { y: yy, m: mm + 1 }));

  const summary = data?.summary;
  const scopeLabel = useMemo(() => (scope === 'strategy' ? cleanName(strategyId) || 'Strategy' : 'Overall'), [scope, strategyId]);

  return (
    <div className="card pnl-page pnl-page--inst">
      <header className="pnl-hero">
        <div className="pnl-hero__titles">
          <h1>Analytics</h1>
        </div>
        <div className="pnl-hero__controls" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="pnl-env-seg" role="group" aria-label="Scope">
            <button
              type="button"
              className={scope === 'overall' ? 'active' : ''}
              onClick={() => setScope('overall')}
            >
              Overall
            </button>
            <button
              type="button"
              className={scope === 'strategy' ? 'active' : ''}
              onClick={() => setScope('strategy')}
            >
              Per strategy
            </button>
          </div>
          {scope === 'strategy' && (
            <select
              className="rounded-desk-sm border border-desk-border bg-desk-panel px-2 py-1 text-xs text-desk-text"
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
              aria-label="Strategy"
            >
              <option value="">Select strategy...</option>
              {strategies.map((sid) => (
                <option key={sid} value={sid}>
                  {cleanName(sid)}
                </option>
              ))}
            </select>
          )}
          <div className="pnl-env-seg" role="group" aria-label="Date mode">
            <button
              type="button"
              className={rangeMode === 'month' ? 'active' : ''}
              onClick={() => setRangeMode('month')}
            >
              Month
            </button>
            <button
              type="button"
              className={rangeMode === 'custom' ? 'active' : ''}
              onClick={() => {
                setRangeMode('custom');
                if (!customFrom || !customTo) {
                  const [yy, mm] = monthStr.split('-').map(Number);
                  const last = new Date(yy, mm, 0).getDate();
                  setCustomFrom(`${monthStr}-01`);
                  setCustomTo(`${monthStr}-${String(last).padStart(2, '0')}`);
                }
              }}
            >
              Custom range
            </button>
          </div>
          {rangeMode === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="font-mono text-[0.65rem] text-desk-muted flex items-center gap-1">
                From
                <input
                  type="date"
                  className="rounded-desk-sm border border-desk-border bg-desk-panel px-2 py-1 text-xs text-desk-text"
                  value={customFrom}
                  min={analyticsMinDate || undefined}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label className="font-mono text-[0.65rem] text-desk-muted flex items-center gap-1">
                To
                <input
                  type="date"
                  className="rounded-desk-sm border border-desk-border bg-desk-panel px-2 py-1 text-xs text-desk-text"
                  value={customTo}
                  min={customFrom || analyticsMinDate || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
            </div>
          )}
        </div>
      </header>

      <section className="qd-hero-grid" aria-label="Overview">
        {loading ? (
          <>
            <div className="qd-hero">
              <Skeleton className="h-6 w-32 mb-3" />
              <Skeleton className="h-10 w-56 mb-2" />
              <Skeleton className="h-4 w-64 mb-5" />
              <Skeleton className="h-[120px] w-full" />
            </div>
            <div className="qd-kpi-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={i} className="qd-kpi-tile">
                  <Skeleton className="h-3 w-24 mb-2" />
                  <Skeleton className="h-6 w-28" />
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="qd-hero">
              <div className="qd-hero__head">
                <div className="qd-hero__label">Total Net PnL</div>
                <div className="qd-hero__chip" title="Scope">{scopeLabel}</div>
              </div>
              <div className={`qd-hero__value ${pnlColor(summary?.total_net_pnl)}`}>{fmtINR(summary?.total_net_pnl)}</div>
              <div className="qd-hero__sub">
                <span>Gross {fmtINR(summary?.total_gross_pnl)}</span>
                <span className="qd-dot" />
                <span>Charges {fmtINR(summary?.total_charges)}</span>
                <span className="qd-dot" />
                <span className={`qd-chip ${pnlColor(summary?.month_return_pct)}`}>Return {fmtPct(summary?.month_return_pct)}</span>
              </div>
              <div className="qd-hero__foot">
                <span className="qd-muted">{summary?.trading_days || 0} trading days</span>
                {summary?.max_drawdown != null && (
                  <>
                    <span className="qd-dot" />
                    <span className="qd-muted">Max DD -{fmtINRCompact(summary?.max_drawdown)}</span>
                  </>
                )}
              </div>
              <div className="qd-hero__chart">
                {derived.equity.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={derived.equity} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="qdHeroFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(56,189,248,0.35)" />
                          <stop offset="100%" stopColor="rgba(56,189,248,0.03)" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(148,163,184,0.10)" vertical={false} />
                      <XAxis dataKey="day" hide />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{ background: 'rgba(2,6,23,0.95)', border: '1px solid rgba(51,65,85,0.6)', borderRadius: 6 }}
                        labelStyle={{ color: 'rgba(148,163,184,0.9)' }}
                        formatter={(v, _n, p) => [fmtINR(v), p?.dataKey === 'cum' ? 'Cumulative' : '']}
                        labelFormatter={(_l, payload) => payload?.[0]?.payload?.date || ''}
                      />
                      <Area type="monotone" dataKey="cum" stroke="rgba(56,189,248,0.9)" strokeWidth={2} fill="url(#qdHeroFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="qd-empty">No closed trades {periodLabel} yet.</div>
                )}
              </div>
            </div>

            <div className="qd-kpi-grid">
              <div className="qd-kpi-tile" title="Average net PnL per trading day">
                <div className="qd-kpi-tile__top">
                  <div className="qd-kpi-tile__label">Average / day</div>
                  <div className="qd-kpi-tile__viz">
                    <Sparkline values={derived.netSeries} color="rgba(56,189,248,0.85)" />
                  </div>
                </div>
                <div className={`qd-kpi-tile__value ${pnlColor(summary?.average_net_pnl)}`}>{fmtINR(summary?.average_net_pnl)}</div>
              </div>

              <div className="qd-kpi-tile" title="Win rate over trades (wins / trades)">
                <div className="qd-kpi-tile__top">
                  <div className="qd-kpi-tile__label">Win Rate</div>
                  <div className="qd-kpi-tile__viz">
                    <StackBar wins={summary?.wins_count || 0} losses={summary?.losses_count || 0} breakeven={summary?.breakeven_count || 0} />
                  </div>
                </div>
                <div className="qd-kpi-tile__value text-desk-text">{fmtPct(summary?.win_rate_pct)}</div>
                <div className="qd-kpi-tile__sub">{summary?.wins_count || 0}W · {summary?.losses_count || 0}L{summary?.breakeven_count ? ` · ${summary.breakeven_count}BE` : ''}</div>
              </div>

              <div className="qd-kpi-tile" title="R:R = Avg win ÷ |Avg loss| · Profit factor = Gross win ÷ |Gross loss|">
                <div className="qd-kpi-tile__label">R:R · Profit Factor</div>
                <div className="qd-kpi-tile__value text-desk-text">{fmtRatio(summary?.payoff_ratio)} · {fmtRatio(summary?.profit_factor)}</div>
                <div className="qd-kpi-tile__sub">reward vs risk</div>
              </div>

              <div className="qd-kpi-tile" title="Peak-to-trough drop in cumulative PnL over the month">
                <div className="qd-kpi-tile__label">Max Drawdown</div>
                <div className={`qd-kpi-tile__value ${pnlColor(summary?.max_drawdown ? -summary.max_drawdown : 0)}`}>
                  {summary?.max_drawdown ? `-${fmtINRCompact(summary.max_drawdown)}` : '—'}
                </div>
                <div className="qd-kpi-tile__sub">{summary?.max_drawdown_pct != null ? `-${summary.max_drawdown_pct.toFixed(2)}% of peak` : 'peak-to-trough'}</div>
              </div>

              <div className="qd-kpi-tile" title="Average ₹ per winning trade vs losing trade">
                <div className="qd-kpi-tile__top">
                  <div className="qd-kpi-tile__label">Avg W / L</div>
                  <div className="qd-kpi-tile__viz">
                    <MiniBars pos={summary?.avg_win || 0} neg={summary?.avg_loss || 0} />
                  </div>
                </div>
                <div className="qd-kpi-tile__value text-desk-text">
                  <span className={pnlColor(summary?.avg_win)}>{fmtINR(summary?.avg_win)}</span>
                  <span className="text-desk-muted"> / </span>
                  <span className={pnlColor(summary?.avg_loss)}>{fmtINR(summary?.avg_loss)}</span>
                </div>
              </div>

              <div className="qd-kpi-tile" title="Average net PnL per trade after charges">
                <div className="qd-kpi-tile__label">Expectancy</div>
                <div className={`qd-kpi-tile__value ${pnlColor(summary?.expectancy_per_trade)}`}>{fmtINR(summary?.expectancy_per_trade)}</div>
                <div className="qd-kpi-tile__sub">per trade</div>
              </div>

              <div
                className="qd-kpi-tile"
                title={
                  scope === 'strategy'
                    ? 'Avg daily peak lots × ₹1.8L margin per lot'
                    : 'Account-wide peak margin from broker fundlimit'
                }
              >
                <div className="qd-kpi-tile__label">{scope === 'strategy' ? 'Est. margin (avg lots × ₹1.8L)' : 'Peak Margin'}</div>
                <div className="qd-kpi-tile__value text-desk-text">{fmtCompactINR(summary?.peak_margin)}</div>
                <div className="qd-kpi-tile__sub">
                  {scope === 'strategy'
                    ? (summary?.avg_lots != null ? `avg ${Number(summary.avg_lots).toFixed(2)} lots` : 'lots × ₹1.8L')
                    : 'capital used'}
                </div>
              </div>

              <div className="qd-kpi-tile" title="Best vs worst day of the month (net PnL)">
                <div className="qd-kpi-tile__label">Best / Worst</div>
                <div className="qd-kpi-tile__value text-desk-text">
                  <span className={pnlColor(summary?.best_day?.net_pnl)}>{fmtINR(summary?.best_day?.net_pnl)}</span>
                  <span className="text-desk-muted"> / </span>
                  <span className={pnlColor(summary?.worst_day?.net_pnl)}>{fmtINR(summary?.worst_day?.net_pnl)}</span>
                </div>
                <div className="qd-kpi-tile__sub">{summary?.best_day?.date || '—'} · {summary?.worst_day?.date || '—'}</div>
              </div>
            </div>
          </>
        )}
      </section>

      <div className="qd-footnote">
        <span title="Average of monthly return % across trailing 12 months with denominators">
          Avg monthly return {fmtPct(monthsAvg?.avg_monthly_return_pct)}
        </span>
        <span className="qd-dot" />
        <span title="Charges as % of gross PnL">
          Charges {summary?.total_gross_pnl ? fmtPct((summary?.total_charges / Math.max(1e-9, Math.abs(summary.total_gross_pnl))) * 100) : '—'}
        </span>
        <span className="qd-dot" />
        <span title="Largest single-trade win / loss in the month">
          Largest {fmtINR(summary?.largest_win)} / {fmtINR(summary?.largest_loss)}
        </span>
      </div>

      <section className="qd-charts-row" aria-label="Charts">
        <div className="qd-chart-card">
          <div className="qd-chart-card__head">
            <div className="qd-chart-card__title">Equity curve</div>
            <div className="qd-chart-card__meta">Cumulative Net PnL · Drawdown</div>
          </div>
          <div className="qd-chart-card__body">
            {derived.equity.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={derived.equity} margin={{ top: 10, right: 14, left: 6, bottom: 6 }}>
                  <defs>
                    <linearGradient id="qdEquityFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(34,197,94,0.28)" />
                      <stop offset="100%" stopColor="rgba(34,197,94,0.03)" />
                    </linearGradient>
                    <linearGradient id="qdDdFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(239,68,68,0.22)" />
                      <stop offset="100%" stopColor="rgba(239,68,68,0.02)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(148,163,184,0.10)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'rgba(148,163,184,0.9)', fontSize: 11, fontFamily: 'var(--mono)' }} />
                  <YAxis
                    tick={{ fill: 'rgba(148,163,184,0.85)', fontSize: 11, fontFamily: 'var(--mono)' }}
                    tickFormatter={(v) => fmtINRCompact(v).replace('₹', '')}
                  />
                  <Tooltip
                    contentStyle={{ background: 'rgba(2,6,23,0.95)', border: '1px solid rgba(51,65,85,0.6)', borderRadius: 6 }}
                    labelStyle={{ color: 'rgba(148,163,184,0.9)' }}
                    labelFormatter={(_l, payload) => payload?.[0]?.payload?.date || ''}
                    formatter={(v, name) => {
                      if (name === 'cum') return [fmtINR(v), 'Cumulative'];
                      if (name === 'net') return [fmtINR(v), 'Day'];
                      if (name === 'dd') return [`-${fmtINRCompact(v)}`, 'Drawdown'];
                      return [v, name];
                    }}
                  />
                  <ReferenceLine y={0} stroke="rgba(148,163,184,0.25)" />
                  <Area type="monotone" dataKey="cum" stroke="rgba(34,197,94,0.9)" strokeWidth={2} fill="url(#qdEquityFill)" />
                  <Area type="monotone" dataKey="dd" stroke="rgba(239,68,68,0.5)" strokeWidth={1.5} fill="url(#qdDdFill)" yAxisId={0} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="qd-empty">No closed trades {periodLabel} yet.</div>
            )}
          </div>
        </div>

        <div className="qd-chart-card">
          <div className="qd-chart-card__head">
            <div className="qd-chart-card__title">Daily PnL</div>
            <div className="qd-chart-card__meta">Click a bar to open day details</div>
          </div>
          <div className="qd-chart-card__body">
            {derived.dist.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={derived.dist} margin={{ top: 10, right: 14, left: 0, bottom: 6 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.10)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'rgba(148,163,184,0.9)', fontSize: 11, fontFamily: 'var(--mono)' }} />
                  <YAxis
                    tick={{ fill: 'rgba(148,163,184,0.85)', fontSize: 11, fontFamily: 'var(--mono)' }}
                    tickFormatter={(v) => fmtINRCompact(v).replace('₹', '')}
                  />
                  <Tooltip
                    contentStyle={{ background: 'rgba(2,6,23,0.95)', border: '1px solid rgba(51,65,85,0.6)', borderRadius: 6 }}
                    labelStyle={{ color: 'rgba(148,163,184,0.9)' }}
                    labelFormatter={(_l, payload) => payload?.[0]?.payload?.date || ''}
                    formatter={(v) => [fmtINR(v), 'Net PnL']}
                  />
                  <ReferenceLine y={0} stroke="rgba(148,163,184,0.25)" />
                  <Bar
                    dataKey="net"
                    radius={[4, 4, 4, 4]}
                    minPointSize={2}
                    onClick={(data, index) => {
                      const date =
                        data?.payload?.date ??
                        (typeof index === 'number' ? derived.dist[index]?.date : undefined);
                      if (date) setSelectedDate(date);
                    }}
                  >
                    {derived.dist.map((entry) => (
                      <Cell
                        key={entry.date}
                        cursor="pointer"
                        fill={
                          entry.net >= 0 ? 'rgba(34,197,94,0.65)' : 'rgba(239,68,68,0.70)'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="qd-empty">No daily bars yet.</div>
            )}
          </div>
        </div>
      </section>

      <p className="mb-2 font-mono text-[0.65rem] text-desk-muted">
        Today&apos;s row stays provisional while the session is open; past days are final after rollup.
      </p>
      {analyticsMinDate && (
        <p className="mb-2 rounded-desk-sm border border-desk-border bg-desk-panel/60 px-3 py-2 font-mono text-[0.65rem] text-desk-muted">
          Broker analytics shown from {analyticsMinDate} (IST). Earlier data remains in the database but is hidden here.
        </p>
      )}
      {scope === 'strategy' && !strategyId.trim() && (
        <p className="mb-2 rounded-desk-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 font-mono text-[0.65rem] text-amber-200">
          Choose a strategy from the dropdown to load {periodLabel} (overall totals use the other tab).
        </p>
      )}

      <div className="pnl-toolbar flex-wrap gap-2" style={{ alignItems: 'center' }}>
        {rangeMode === 'month' ? (
          <>
            <button
              type="button"
              className="pnl-btn-reset"
              onClick={goPrev}
              disabled={!canGoPrevMonth}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-mono text-sm uppercase tracking-wider text-desk-text">{monthLabel}</span>
            <button type="button" className="pnl-btn-reset" onClick={goNext} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : (
          <span className="font-mono text-sm uppercase tracking-wider text-desk-text">
            {customFrom && customTo ? `${customFrom} → ${customTo}` : 'Select range'}
          </span>
        )}
        <span className="pnl-toolbar__sep" />
        <button type="button" className="pnl-btn-reset" onClick={loadPeriod} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <span className="pnl-toolbar__sep" />
        {!chargesEditorOpen ? (
          <button
            type="button"
            className="rounded-full border border-desk-border bg-desk-panel/80 px-3 py-1 font-mono text-[0.7rem] text-desk-text hover:bg-white/5"
            title="Charge rate: peak_lots × trades × ₹/lot/trade"
            onClick={() => {
              setPerTradeDraft(perTrade != null ? String(perTrade) : '0');
              setChargesEditorOpen(true);
            }}
          >
            ₹ / lot / trade: {perTrade != null ? fmtINR(perTrade) : '—'}
          </button>
        ) : (
          <span className="flex flex-wrap items-center gap-2 rounded-desk-sm border border-desk-border bg-black/25 px-2 py-1">
            <label className="font-mono text-[0.65rem] text-desk-muted">
              ₹ / lot / trade
              <input
                type="number"
                min={0}
                step={0.01}
                className="ml-2 w-24 rounded border border-desk-border bg-desk-panel px-2 py-1 font-mono text-xs text-desk-text"
                value={perTradeDraft}
                onChange={(e) => setPerTradeDraft(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="rounded-desk-sm bg-emerald-600/80 px-2 py-1 font-mono text-[0.65rem] text-white disabled:opacity-50"
              disabled={savingCharges}
              onClick={() => savePerTrade()}
            >
              {savingCharges ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="pnl-btn-reset font-mono text-[0.65rem]"
              disabled={savingCharges}
              onClick={() => setChargesEditorOpen(false)}
            >
              Cancel
            </button>
          </span>
        )}
      </div>

      {error && (
        <div className="pnl-alert--error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {rangeMode === 'month' ? (
        <div className="rounded-desk border border-desk-border overflow-hidden" style={{ background: 'var(--bg-card)' }}>
          <div className="grid grid-cols-7 border-b border-desk-border bg-black/30" role="row">
            {WEEKDAYS.map((wd) => (
              <div
                key={wd}
                className="px-3 py-2 text-center font-mono text-[0.7rem] uppercase tracking-wider text-desk-muted"
                role="columnheader"
              >
                {wd}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7" role="grid">
            {cells.map((dateStr, idx) => {
              if (!dateStr) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="min-h-[110px] border-b border-r border-desk-border bg-black/20"
                  />
                );
              }
              const row = dayMap.get(dateStr);
              const day = Number(dateStr.slice(8, 10));
              const net = row?.net_pnl;
              const isTodayCell = dateStr === istTodayStr;
              const isProvisional = row && row.status === 'provisional' && isTodayCell;
              const intensity = net != null ? Math.min(1, Math.abs(net) / Math.max(1, derived.maxAbsNet || 1)) : 0;
              const heatBg = net == null ? null : net >= 0
                ? `rgba(34,197,94,${0.06 + 0.34 * intensity})`
                : `rgba(239,68,68,${0.06 + 0.34 * intensity})`;
              const isSelected = selectedDate === dateStr;
              const beforeDisplayMin = analyticsMinDate && dateStr < analyticsMinDate;
              return (
                <button
                  type="button"
                  key={dateStr}
                  disabled={beforeDisplayMin}
                  onClick={() => {
                    if (beforeDisplayMin) return;
                    setSelectedDate((cur) => (cur === dateStr ? null : dateStr));
                  }}
                  className={`min-h-[106px] border-b border-r border-desk-border p-2 text-left transition-colors ${
                    beforeDisplayMin
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:bg-white/5'
                  } ${isSelected ? 'ring-2 ring-[var(--accent)] ring-inset' : ''}`}
                  style={heatBg && !beforeDisplayMin ? { backgroundColor: heatBg } : undefined}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[0.75rem] text-desk-muted">{day}</span>
                    {isProvisional && (
                      <span
                        className="rounded px-1 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-300"
                        title="Still trading today — summary updates until session ends."
                      >
                        Prov
                      </span>
                    )}
                  </div>
                  {row ? (
                    <div className="mt-1 space-y-0.5">
                      <div className={`font-mono text-[0.85rem] font-semibold tabular-nums ${pnlColor(net)}`}>
                        {fmtINR(net)}
                      </div>
                      <div className="font-mono text-[0.65rem] tabular-nums text-desk-muted">
                        {row.trades_count || 0} trades
                      </div>
                      <div className="font-mono text-[0.65rem] tabular-nums text-desk-muted">
                        {row.charges_total > 0 ? `Chg ${fmtINRCompact(row.charges_total)}` : null}
                        {row.charges_total > 0 && row.capital_used_peak != null ? ', ' : null}
                        {row.capital_used_peak != null ? `Margin ${fmtINRCompact(row.capital_used_peak)}` : null}
                      </div>
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-desk border border-desk-border overflow-hidden" style={{ background: 'var(--bg-card)' }}>
          <div className="border-b border-desk-border bg-black/30 px-3 py-2 font-mono text-[0.7rem] uppercase tracking-wider text-desk-muted">
            Days in range
          </div>
          {(data?.days || []).length === 0 ? (
            <div className="qd-empty px-3 py-6">No trading days in {periodLabel}.</div>
          ) : (
            <div className="divide-y divide-desk-border max-h-[420px] overflow-y-auto">
              {(data?.days || []).map((row) => {
                const dateStr = row.ist_date;
                const net = row.net_pnl;
                const isSelected = selectedDate === dateStr;
                const isTodayCell = dateStr === istTodayStr;
                const isProvisional = row.status === 'provisional' && isTodayCell;
                return (
                  <button
                    type="button"
                    key={dateStr}
                    onClick={() => setSelectedDate((cur) => (cur === dateStr ? null : dateStr))}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-white/5 ${
                      isSelected ? 'bg-white/5 ring-1 ring-inset ring-[var(--accent)]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[0.8rem] text-desk-muted">{dateStr}</span>
                      {isProvisional && (
                        <span className="rounded px-1 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-300">
                          Prov
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[0.75rem] tabular-nums">
                      <span className="text-desk-muted">{row.trades_count || 0} trades</span>
                      <span className={`font-semibold ${pnlColor(net)}`}>{fmtINR(net)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {selectedDate && (
        <section className="open-positions-section">
          <div className="open-positions-header">
            <h3>
              {selectedDate}
              {dayDetail?.overall?.status === 'provisional' && selectedDate === istTodayStr && (
                <span className="ml-2 rounded px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-300">
                  Provisional
                </span>
              )}
              {(dayDetail?.overall?.status === 'final' || selectedDate !== istTodayStr) && dayDetail?.overall && (
                <span className="ml-2 rounded px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider bg-emerald-500/20 text-emerald-300">
                  Final
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-close-panel" onClick={() => setSelectedDate(null)}>
                Close
              </button>
            </div>
          </div>
          {dayDetail?.overall ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[0.7rem] uppercase tracking-wider text-desk-muted">
                  <tr>
                    <th className="px-3 py-2">Strategy</th>
                    <th
                      className="px-3 py-2 text-right"
                      title="Strategy rows: peak lots × ₹1.8L. Overall row: broker peak margin."
                    >
                      Capital Used
                    </th>
                    <th className="px-3 py-2 text-right">Gross PnL</th>
                    <th className="px-3 py-2 text-right">Charges</th>
                    <th className="px-3 py-2 text-right">Net PnL</th>
                    <th className="px-3 py-2 text-right">Trades</th>
                    <th className="px-3 py-2 text-right" title="Wins / Losses">W/L</th>
                    <th className="px-3 py-2 text-right">Win %</th>
                    <th className="px-3 py-2 text-right" title="Average winning trade ₹">Avg W</th>
                    <th className="px-3 py-2 text-right" title="Average losing trade ₹">Avg L</th>
                    <th className="px-3 py-2 text-right" title="Avg win ÷ |Avg loss|">R:R</th>
                  </tr>
                  <tr className="qd-table-group">
                    <th className="px-3 py-1" />
                    <th className="px-3 py-1 text-center" colSpan={5}>P&amp;L</th>
                    <th className="px-3 py-1 text-center" colSpan={5}>Trade quality</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDayStrategies.map((s) => (
                    <tr key={s.strategy_id} className="border-t border-desk-border">
                      <td className="px-3 py-2 font-medium">{cleanName(s.strategy_id)}</td>
                      <td
                        className="px-3 py-2 text-right font-mono tabular-nums text-desk-muted"
                        title={
                          s.capital_used_kind === 'lots_x_margin'
                            ? `Peak lots${s.peak_lots != null ? ` (${s.peak_lots})` : ''} × ₹1.8L margin per lot`
                            : s.capital_used_kind === 'notional_estimate'
                              ? 'Peak notional (legacy estimate).'
                              : undefined
                        }
                      >
                        {s.capital_used_peak != null ? fmtCompactINR(s.capital_used_peak) : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono tabular-nums ${pnlColor(s.gross_pnl)}`}>
                        {fmtINR(s.gross_pnl)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-desk-muted">
                        {fmtINR(s.charges_total)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono tabular-nums ${pnlColor(s.net_pnl)}`}>
                        {fmtINR(s.net_pnl)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{s.trades_count || 0}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-desk-muted">
                        {(s.wins_count || 0)}/{(s.losses_count || 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {s.win_rate != null ? fmtPct(s.win_rate * 100) : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono tabular-nums ${pnlColor(s.avg_win)}`}>
                        {fmtINR(s.avg_win)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono tabular-nums ${pnlColor(s.avg_loss)}`}>
                        {fmtINR(s.avg_loss)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {fmtRatio(s.payoff_ratio)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-desk-border bg-black/30 qd-table-overall">
                    <td className="px-3 py-2 font-bold">Overall</td>
                    <td
                      className="px-3 py-2 text-right font-mono tabular-nums"
                      title={
                        dayDetail.overall.capital_used_kind === 'broker_margin'
                          ? 'Account-wide peak margin from broker fundlimit'
                          : undefined
                      }
                    >
                      {dayDetail.overall.capital_used_peak != null
                        ? fmtCompactINR(dayDetail.overall.capital_used_peak)
                        : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono tabular-nums font-bold ${pnlColor(dayDetail.overall.gross_pnl)}`}>
                      {fmtINR(dayDetail.overall.gross_pnl)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtINR(dayDetail.overall.charges_total)}</td>
                    <td className={`px-3 py-2 text-right font-mono tabular-nums font-bold ${pnlColor(dayDetail.overall.net_pnl)}`}>
                      {fmtINR(dayDetail.overall.net_pnl)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{dayDetail.overall.trades_count || 0}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-desk-muted">
                      {(dayDetail.overall.wins_count || 0)}/{(dayDetail.overall.losses_count || 0)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {dayDetail.overall.win_rate != null ? fmtPct(dayDetail.overall.win_rate * 100) : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono tabular-nums ${pnlColor(dayDetail.overall.avg_win)}`}>
                      {fmtINR(dayDetail.overall.avg_win)}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono tabular-nums ${pnlColor(dayDetail.overall.avg_loss)}`}>
                      {fmtINR(dayDetail.overall.avg_loss)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {fmtRatio(dayDetail.overall.payoff_ratio)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="no-positions">No data for this day yet.</p>
          )}
          <div className="mt-4">
            <MTMChart embedded date={selectedDate} />
          </div>
        </section>
      )}
    </div>
  );
}
