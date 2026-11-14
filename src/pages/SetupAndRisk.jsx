/**
 * Setup & Risk — Combined Strategy Configuration + Risk Management.
 * To START a strategy: Backend Algo ON + RMS Code ON + RMS Orders ON.
 * All three must be ON for signals to reach the exchange.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toISTCompact } from '../utils/formatIST';
import { Mono, StatusDot, PanelHeader } from '../components/ui';
import { API, RMS_API, deskFetch } from '../config/deskApi';
import { useDeskShell } from '../context/DeskShellContext';
import { getStrategyDisplayName, strategyMatchesSearch } from '../lib/strategyDisplayNames';
import { ENTRY_TIMES, EXIT_TIMES } from '../lib/strategyMetadata';
import {
  DTE_FILTERS,
  DTE_FILTER_OPTIONS,
  buildSetupDteSections,
  groupSetupVersions,
  strategyMatchesDteFilter,
  uniqueSectionBooks,
} from '../lib/strategyDteBuckets';
import { baseCapitalDeployed, marginPerLotForSection } from '../lib/baseCapital';

const SETUP_MATRIX_COL_COUNT = 13;
const OPEN_SECTIONS_KEY = 'setupRisk.openSections';

function readOpenSections() {
  try {
    const raw = window.localStorage.getItem(OPEN_SECTIONS_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeOpenSections(ids) {
  try {
    window.localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify([...ids]));
  } catch {
    /* private mode or a full store — the open set still works for this visit */
  }
}

/** Qty per 1 lot — prefer /api/symbols row; else NIFTY=65, SENSEX=20 (matches Backend). */
const getContractMultiplier = (underlyingScrip, symbolList) => {
  const u = Number(underlyingScrip);
  const row = (symbolList || []).find((x) => Number(x.security_id) === u);
  if (row != null && row.lot_size != null && row.lot_size !== '') return Number(row.lot_size);
  if (u === 13) return 65;
  if (u === 15) return 20;
  return 25;
};
const ABS_SL_TYPES = new Set(['overall_absolute', 'per_leg_absolute', 'overall_book_absolute']);

const isPctSlType = (slType) => typeof slType === 'string' && slType.includes('pct');
const isRupeeSl = (sl) => sl && ABS_SL_TYPES.has(sl.type);

/** Compact MAX LOSS cell — rupee SL (= RMS) or pct SL + manual RMS. */
const formatMaxLossDisplay = (sl, rc, lot) => {
  if (isRupeeSl(sl)) {
    const perLot = Math.abs(Number(sl.value));
    const effective = perLot * lot;
    const suffix = sl.type === 'per_leg_absolute' ? '/leg' : '';
    return {
      primary: `₹${effective.toLocaleString()}${suffix}`,
      hint: lot > 1 ? `₹${perLot.toLocaleString()}×${lot}` : null,
    };
  }
  const pctLabel = isPctSlType(sl?.type)
    ? `${Math.round(Number(sl.value) * 100)}% SL`
    : null;
  const perLot = Math.abs(Number(rc?.max_daily_loss ?? 10000));
  const effective = rc?.effective_max_daily_loss != null
    ? Math.abs(Number(rc.effective_max_daily_loss))
    : perLot * lot;
  return {
    primary: pctLabel ? `${pctLabel} · ₹${effective.toLocaleString()}` : `₹${effective.toLocaleString()}`,
    hint: lot > 1 ? `RMS ₹${perLot.toLocaleString()}×${lot}` : (pctLabel ? 'RMS backstop' : null),
  };
};
const MiniToggle = ({ checked, onChange, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
    <label className="toggle-switch" style={{ width: 32, height: 16 }}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="toggle-slider" style={{ borderRadius: 16 }}></span>
    </label>
    <span style={{ fontSize: '0.68rem', color: checked ? 'var(--positive)' : 'var(--text-muted)', fontWeight: 500, fontFamily: 'var(--mono)' }}>{label}</span>
  </div>
);

const thStyle = { padding: '0.4rem 0.65rem', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', whiteSpace: 'nowrap', fontFamily: 'var(--mono)' };
const tdStyle = { padding: '0.4rem 0.65rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: '0.78rem' };

export default function SetupAndRisk() {
  const [configs, setConfigs] = useState([]);
  const [backendStrategies, setBackendStrategies] = useState([]);
  const [rmsConfig, setRmsConfig] = useState(null);
  const [rmsStrategies, setRmsStrategies] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [clock, setClock] = useState(new Date());
  const [editLimits, setEditLimits] = useState(null);
  const [stratForm, setStratForm] = useState({});
  const [maxQty, setMaxQty] = useState(900);
  const [maxLossOverall, setMaxLossOverall] = useState(50000);
  const [maxRateAccount, setMaxRateAccount] = useState(20);
  const [holidays, setHolidays] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [rmsError, setRmsError] = useState(null);
  const [success, setSuccess] = useState('');
  const [decisionFilter, setDecisionFilter] = useState('ALL');
  const [decisionSearch, setDecisionSearch] = useState('');
  const [dteFilter, setDteFilter] = useState(DTE_FILTERS.ALL);
  const [openSections, setOpenSections] = useState(readOpenSections);
  const [lotSizes, setLotSizes] = useState({});  // strategyId -> lot (for live qty update)
  const [symbols, setSymbols] = useState([]);
  const [rerunBusyById, setRerunBusyById] = useState({});
  const [familyBusy, setFamilyBusy] = useState(false);
  const [familyForms, setFamilyForms] = useState({});
  const [familyLimitsBusy, setFamilyLimitsBusy] = useState(false);
  const [strategySl, setStrategySl] = useState({});
  const decisionIntervalRef = useRef(null);
  const { strategyWorkerOk, strategyWorkerStatus } = useDeskShell();

  const toggleDteSection = useCallback((sectionId) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      writeOpenSections(next);
      return next;
    });
  }, []);

  const pollCommandResult = async (commandId, attempts = 24) => {
    for (let i = 0; i < attempts; i += 1) {
      const r = await deskFetch(`${API}/strategy-commands/${encodeURIComponent(commandId)}`);
      const d = await r.json().catch(() => ({}));
      if (d.found && d.status && d.status !== 'pending') {
        return d;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return null;
  };

  const flash = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  // Sync lotSizes from RMS when strategies load
  useEffect(() => {
    if (!rmsStrategies.length) return;
    const next = {};
    rmsStrategies.forEach((s) => {
      const bc = configs.find((c) => c.strategy_id === s.id);
      const underlying = Number(bc?.underlying_scrip ?? 13);
      const mult = getContractMultiplier(underlying, symbols);
      const lot = s.lot_size ?? (s.order_quantity ? Math.round(s.order_quantity / mult) : 1);
      next[s.id] = lot;
    });
    setLotSizes((prev) => ({ ...prev, ...next }));
  }, [rmsStrategies, configs, symbols]);

  const loadBackend = useCallback(() => {
    deskFetch(`${API}/strategy-configs`).then(r => r.json()).then(d => setConfigs(d.configs || [])).catch(() => setConfigs([]));
    deskFetch(`${API}/strategies`)
      .then(r => r.ok ? r.json() : { strategies: [] })
      .then(d => setBackendStrategies(d.strategies || []))
      .catch(() => setBackendStrategies([]));
    deskFetch(`${API}/strategy-sl`)
      .then(r => r.ok ? r.json() : { strategies: {} })
      .then(d => setStrategySl(d.strategies || {}))
      .catch(() => setStrategySl({}));
    deskFetch(`${API}/symbols`)
      .then(r => r.ok ? r.json() : { symbols: [] })
      .then(d => setSymbols(d.symbols || []))
      .catch(() => setSymbols([]));
  }, []);

  const loadRms = useCallback(() => {
    setRmsError(null);
    deskFetch(`${RMS_API}/config`)
      .then(r => { if (!r.ok) throw new Error('RMS not reachable'); return r.json(); })
      .then(d => {
        setRmsConfig(d);
        setMaxQty(d.max_qty_per_order || 900);
        setMaxLossOverall(Math.abs(d.max_daily_loss_overall || 50000));
        setMaxRateAccount(d.max_orders_per_sec_account || 20);
        setHolidays((d.holidays || []).join(', '));
        setRmsStrategies(Object.entries(d.strategies || {}).map(([id, cfg]) => ({ id, ...cfg })));
      })
      .catch(() => { setRmsStrategies([]); setRmsError('RMS OFFLINE'); });
  }, []);

  const loadDecisions = useCallback(() => {
    deskFetch(`${RMS_API}/decisions?limit=100`).then(r => r.ok ? r.json() : []).then(rows => setDecisions(Array.isArray(rows) ? rows : [])).catch(() => {});
  }, []);

  useEffect(() => { loadBackend(); }, [loadBackend]);
  useEffect(() => { loadRms(); }, [loadRms]);
  useEffect(() => {
    loadDecisions();
    decisionIntervalRef.current = setInterval(loadDecisions, 5000);
    return () => { if (decisionIntervalRef.current) clearInterval(decisionIntervalRef.current); };
  }, [loadDecisions]);
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  const getBackendCfg = (sid) => configs.find(c => c.strategy_id === sid) || {};
  const getRmsCfg = (sid) => rmsStrategies.find(s => s.id === sid) || {};

  const setFamilyLive = async (members, live) => {
    if (familyBusy || !members?.length) return;
    setFamilyBusy(true);
    const ids = members.map((s) => s.id).filter(Boolean);
    try {
      const [beRes, rmsRes] = await Promise.all([
        deskFetch(`${API}/strategy-configs/bulk-toggle`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ strategy_ids: ids, enabled: live }),
        }),
        deskFetch(`${RMS_API}/strategies/bulk-toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            strategy_ids: ids,
            code_enabled: live,
            order_enabled: live,
          }),
        }),
      ]);
      const problems = [];
      if (!beRes.ok) {
        const detail = await beRes.text().catch(() => '');
        problems.push(`Backend bulk toggle failed (${beRes.status}) ${detail.slice(0, 120)}`);
      }
      if (!rmsRes.ok) {
        const detail = await rmsRes.text().catch(() => '');
        problems.push(`RMS bulk toggle failed (${rmsRes.status}) ${detail.slice(0, 120)}`);
      }
      loadBackend();
      loadRms();
      if (problems.length) {
        flash(problems.join(' · '));
        return;
      }
      flash(`${ids.length} algos ${live ? 'ON' : 'OFF'}`);
    } catch (err) {
      loadBackend();
      loadRms();
      flash(`Family toggle failed: ${err?.message || err}`);
    } finally {
      setFamilyBusy(false);
    }
  };

  const applyFamilyLimits = async (section) => {
    if (familyLimitsBusy || !section?.strategies?.length) return;
    const form = familyForms[section.id] || {};
    const patch = {};
    const lots = String(form.lot_size ?? '').trim();
    if (lots !== '') {
      const n = Number(lots);
      if (!Number.isFinite(n) || n < 1) {
        flash('Lots must be at least 1');
        return;
      }
      patch.lot_size = Math.floor(n);
    }
    const limitFields = [
      ['max_daily_loss', 'Max loss'],
      ['max_orders_per_sec', 'Max orders/sec'],
      ['max_trades_per_day', 'Max trades/day'],
      ['retry_wait_sec', 'Retry wait'],
    ];
    for (const [key, label] of limitFields) {
      const raw = String(form[key] ?? '').trim();
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        flash(`${label} must be a number`);
        return;
      }
      patch[key] = n;
    }
    if (!Object.keys(patch).length) {
      flash('Enter lots or a limit to apply');
      return;
    }
    const ids = section.strategies.map((s) => s.id).filter(Boolean);
    if (!ids.length) return;
    const strategies = Object.fromEntries(ids.map((id) => [id, { ...patch }]));
    setFamilyLimitsBusy(section.id);
    try {
      const res = await deskFetch(`${RMS_API}/config/limits`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategies }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        flash(`Family limits failed (${res.status}) ${detail.slice(0, 120)}`);
        return;
      }
      const parts = [];
      if (patch.lot_size != null) parts.push(`lots ${patch.lot_size}`);
      if (patch.max_daily_loss != null) parts.push(`loss ${patch.max_daily_loss}`);
      if (patch.max_orders_per_sec != null) parts.push(`orders/sec ${patch.max_orders_per_sec}`);
      if (patch.max_trades_per_day != null) parts.push(`trades/day ${patch.max_trades_per_day}`);
      if (patch.retry_wait_sec != null) parts.push(`retry ${patch.retry_wait_sec}s`);
      flash(`${ids.length} books updated: ${parts.join(', ')}`);
    } catch (err) {
      flash(`Family limits failed: ${err?.message || err}`);
    } finally {
      loadRms();
      setFamilyLimitsBusy(false);
    }
  };

  const handleBackendToggle = async (strategyId, current) => {
    await deskFetch(`${API}/strategy-configs/${strategyId}/toggle`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !current }),
    });
    loadBackend();
    flash('Backend config updated');
  };

  const toggleCode = async (id, c) => {
    await deskFetch(`${RMS_API}/strategies/${id}/toggle-code?enabled=${!c}`, { method: 'POST' });
    flash(`${getStrategyDisplayName(id)} code ${!c ? 'ON' : 'OFF'}`);
    loadRms();
  };
  const toggleOrders = async (id, c) => {
    await deskFetch(`${RMS_API}/strategies/${id}/toggle-orders?enabled=${!c}`, { method: 'POST' });
    flash(`${getStrategyDisplayName(id)} orders ${!c ? 'ON' : 'OFF'}`);
    loadRms();
  };
  const toggleAccount = async () => {
    const s = !(rmsConfig?.account_enabled ?? true);
    await deskFetch(`${RMS_API}/account/toggle?enabled=${s}`, { method: 'POST' });
    flash(s ? 'Account ENABLED' : 'Account DISABLED');
    loadRms();
  };
  const killAccount = async () => {
    if (!window.confirm('⚠️ SQUARE OFF ALL POSITIONS — DISABLE ALL TRADING?')) return;
    await deskFetch(`${RMS_API}/account/kill`, { method: 'POST' });
    flash('EMERGENCY HALT — All trading disabled');
    loadRms();
  };
  const saveGlobal = async () => {
    setSaving(true);
    const hols = holidays.split(',').map(h => h.trim()).filter(Boolean);
    await deskFetch(`${RMS_API}/config/limits`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_qty_per_order: maxQty, max_daily_loss_overall: -Math.abs(maxLossOverall), max_orders_per_sec_account: maxRateAccount, holidays: hols }),
    });
    setSaving(false);
    flash('Global limits updated');
    loadRms();
  };
  const squareOff = async (id) => {
    if (!window.confirm(`Square off all positions for ${getStrategyDisplayName(id)}?`)) return;
    const r = await deskFetch(`${RMS_API}/strategies/${id}/squareoff`, { method: 'POST' });
    const d = await r.json();
    flash(`${getStrategyDisplayName(id)}: ${d.positions_closed || 0} positions closed`);
    loadRms();
  };

  const rerunNow = async (id) => {
    if (!strategyWorkerOk) {
      flash(`${getStrategyDisplayName(id)} blocked: strategy worker ${strategyWorkerStatus || 'offline'}`);
      return;
    }
    if (!window.confirm(`Re-run ${getStrategyDisplayName(id)} now (manual override, flat-only)?`)) return;
    setRerunBusyById((p) => ({ ...p, [id]: true }));
    try {
      const r = await deskFetch(`${API}/strategies/${encodeURIComponent(id)}/rerun`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'YES' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        flash(`Re-run failed: ${d.detail || r.status}`);
        return;
      }
      if (!d.allowed) {
        const reason = d.reason || 'BLOCKED';
        if (reason === 'NOT_FLAT') flash(`${getStrategyDisplayName(id)} blocked: NOT FLAT (${d.open_positions || 0} open)`);
        else if (reason === 'COOLDOWN') flash(`${getStrategyDisplayName(id)} blocked: COOLDOWN (${d.retry_after_sec || '?'}s)`);
        else if (reason === 'STRATEGY_WORKER_UNAVAILABLE') {
          flash(`${getStrategyDisplayName(id)} blocked: worker ${d.strategy_worker || 'offline'}`);
        } else flash(`${getStrategyDisplayName(id)} blocked: ${reason}`);
        return;
      }
      if (d.queued && d.command_id) {
        flash(`${getStrategyDisplayName(id)} queued — waiting for worker…`);
        const result = await pollCommandResult(d.command_id);
        if (!result) {
          flash(`${getStrategyDisplayName(id)} queued but worker result timed out (${d.command_id})`);
          return;
        }
        if (result.status === 'rejected') {
          flash(`${getStrategyDisplayName(id)} rejected: ${result.reason || 'REJECTED'}`);
          return;
        }
        const n = Number(result.intents || 0);
        const published = Number(result.published || 0);
        if (n === 0) {
          flash(`${getStrategyDisplayName(id)} completed with 0 signals — check premium filter and snapshot`);
        } else {
          flash(`${getStrategyDisplayName(id)} re-run OK: intents ${n}, published ${published} (MICROSERVICE)`);
        }
        return;
      }
      const n = Number(d.intents || 0);
      const published = Number(d.published || 0);
      if (n === 0) {
        flash(`${getStrategyDisplayName(id)} ran but produced 0 signals — check premium filter and snapshot`);
      } else {
        flash(
          `${getStrategyDisplayName(id)} re-run OK: intents ${n}, published ${published}${d.mode ? ` (${d.mode})` : ''}`
        );
      }
    } catch {
      flash('Re-run failed: network');
    } finally {
      setRerunBusyById((p) => ({ ...p, [id]: false }));
      loadBackend();
      loadRms();
    }
  };

  const saveStratLotSize = async (strategyId, lotSize) => {
    if (!lotSize || lotSize < 1) return;
    setSaving(true);
    await deskFetch(`${RMS_API}/config/limits`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategies: { [strategyId]: { lot_size: Number(lotSize) } } }),
    });
    setSaving(false);
    const bc = configs.find((c) => c.strategy_id === strategyId);
    const mult = getContractMultiplier(bc?.underlying_scrip ?? 13, symbols);
    const qty = Number(lotSize) * mult;
    const rc = getRmsCfg(strategyId);
    const sl = strategySl[strategyId];
    const disp = formatMaxLossDisplay(sl, rc, Number(lotSize));
    flash(`✓ ${getStrategyDisplayName(strategyId)} lot → ${lotSize} (qty ${qty}) · ${disp.primary}`);
    loadRms();
  };

  const saveStrategySymbol = async (strategyId, underlyingScrip) => {
    const current = getBackendCfg(strategyId);
    const symbol = symbols.find(s => Number(s.security_id) === Number(underlyingScrip));
    await deskFetch(`${API}/strategy-configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy_id: strategyId,
        enabled: current.enabled ?? false,
        underlying_scrip: Number(underlyingScrip),
        segment: symbol?.segment || current.segment || 'IDX_I',
        expiry: current.expiry || null,
        params: current.params || {},
      }),
    });
    loadBackend();
    flash(`${getStrategyDisplayName(strategyId)} symbol updated`);
  };
  const openEditLimits = (s) => {
    const sid = s.id;
    const sl = strategySl[sid];
    const syncedPerLot = isRupeeSl(sl) ? -Math.abs(Number(sl.value)) : (s.max_daily_loss ?? -10000);
    setStratForm({
      max_daily_loss: syncedPerLot,
      max_orders_per_sec: s.max_orders_per_sec ?? 5,
      max_trades_per_day: s.max_trades_per_day ?? 50,
      retry_wait_sec: s.retry_wait_sec ?? 5,
    });
    setEditLimits(sid);
  };
  const saveStratLimits = async (e) => {
    e.preventDefault();
    setSaving(true);
    const sl = strategySl[editLimits];
    const body = {
      max_orders_per_sec: Number(stratForm.max_orders_per_sec),
      max_trades_per_day: Number(stratForm.max_trades_per_day),
      retry_wait_sec: Number(stratForm.retry_wait_sec),
    };
    if (!isRupeeSl(sl)) {
      body.max_daily_loss = Number(stratForm.max_daily_loss);
    }
    await deskFetch(`${RMS_API}/config/limits`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategies: { [editLimits]: body } }),
    });
    setSaving(false);
    setEditLimits(null);
    flash(`✓ ${getStrategyDisplayName(editLimits)} limits saved`);
    loadRms();
  };

  const isMarketOpen = () => {
    const h = clock.getHours(), m = clock.getMinutes(), day = clock.getDay();
    if (day === 0 || day === 6) return false;
    if (h < 9 || (h === 9 && m < 15)) return false;
    if (h > 15 || (h === 15 && m >= 30)) return false;
    return true;
  };

  const mergedStrategies = backendStrategies.length > 0
    ? backendStrategies.map(sid => {
        const bc = getBackendCfg(sid);
        const rc = getRmsCfg(sid);
        const backendOn = bc.enabled ?? false;
        const codeOn = rc.code_enabled ?? true;
        const ordersOn = rc.order_enabled ?? true;
        const isTrading = backendOn && codeOn && ordersOn;
        return {
          id: sid,
          backendOn,
          codeOn,
          ordersOn,
          isTrading,
          bc,
          rc,
        };
      })
    : rmsStrategies.map(s => ({
        id: s.id,
        backendOn: false,
        codeOn: s.code_enabled ?? true,
        ordersOn: s.order_enabled ?? true,
        isTrading: false,
        rc: s,
      }));

  const filteredDecisions = decisions.filter(d => {
    const passDecision = decisionFilter === 'ALL' ? true : d.decision === decisionFilter;
    const passSearch = strategyMatchesSearch(d.strategy_id, decisionSearch)
      || String(d.reason_code || '').toLowerCase().includes(decisionSearch.trim().toLowerCase());
    return passDecision && passSearch;
  });

  const visibleStrategies = mergedStrategies.filter((s) => strategyMatchesDteFilter(s.id, dteFilter));
  const dteSections = useMemo(
    () => buildSetupDteSections(visibleStrategies, dteFilter),
    [visibleStrategies, dteFilter],
  );
  const setupGroups = useMemo(() => groupSetupVersions(dteSections), [dteSections]);
  const anySectionOpen = setupGroups.some((group) => group.sections.some(
    (section) => section.collapsible === false || openSections.has(section.id),
  ));

  const renderStrategyRow = (s, sectionId) => {
    const underlying = Number((s.bc?.underlying_scrip) ?? 13);
    const lotMultiplier = getContractMultiplier(underlying, symbols);
    const lot = Math.max(1, lotSizes[s.id] ?? s.rc?.lot_size ?? (s.rc?.order_quantity ? Math.round(s.rc.order_quantity / lotMultiplier) : 1));
    const qty = lot * lotMultiplier;
    const capital = baseCapitalDeployed(lot, marginPerLotForSection(sectionId));
    return (
      <tr key={`${sectionId}-${s.id}`} style={{ borderBottom: '1px solid rgba(51,65,85,0.5)' }}>
        <td style={tdStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: 3, height: 20, borderRadius: 2, background: s.isTrading ? 'var(--positive)' : 'var(--negative)' }} />
            <Mono size="0.82rem">{getStrategyDisplayName(s.id)}</Mono>
          </div>
        </td>
        <td style={tdStyle}>{ENTRY_TIMES[s.id] || '—'}</td>
        <td style={tdStyle}>{EXIT_TIMES[s.id] || '—'}</td>
        <td style={{ ...tdStyle, textAlign: 'center' }}>
          <input type="number" min={1} value={lot}
            onChange={e => setLotSizes(p => ({ ...p, [s.id]: Math.max(1, Number(e.target.value) || 1) }))}
            onBlur={e => saveStratLotSize(s.id, Number(e.target.value) || 1)}
            style={{ width: 52, padding: '0.2rem 0.35rem', fontSize: '0.78rem', textAlign: 'center' }} />
        </td>
        <td style={{ ...tdStyle, textAlign: 'center' }}>
          <Mono size="0.82rem" color="var(--text-muted)">{qty}</Mono>
        </td>
        <td style={{ ...tdStyle, textAlign: 'right' }} title="Lots × margin per lot for this DTE section">
          <Mono size="0.82rem">
            {capital != null
              ? `₹${capital.toLocaleString('en-IN')}`
              : '—'}
          </Mono>
        </td>
        <td style={{ ...tdStyle, textAlign: 'center' }}>
          <select
            value={underlying}
            onChange={(e) => saveStrategySymbol(s.id, Number(e.target.value))}
            style={{ padding: '0.2rem 0.35rem', fontSize: '0.78rem' }}
          >
            {symbols.map(sym => (
              <option key={sym.security_id} value={sym.security_id}>
                {sym.display_name || sym.symbol_name || sym.security_id}
              </option>
            ))}
          </select>
        </td>
        <td style={{ ...tdStyle, textAlign: 'center' }}>
          <MiniToggle checked={s.backendOn} onChange={() => handleBackendToggle(s.id, s.backendOn)} label={s.backendOn ? 'ON' : 'OFF'} />
        </td>
        <td style={{ ...tdStyle, textAlign: 'center' }}>
          <MiniToggle checked={s.codeOn} onChange={() => toggleCode(s.id, s.codeOn)} label={s.codeOn ? 'ON' : 'OFF'} />
        </td>
        <td style={{ ...tdStyle, textAlign: 'center' }}>
          <MiniToggle checked={s.ordersOn} onChange={() => toggleOrders(s.id, s.ordersOn)} label={s.ordersOn ? 'ON' : 'OFF'} />
        </td>
        <td style={{ ...tdStyle, textAlign: 'center' }}>
          <span style={{
            padding: '0.12rem 0.4rem', borderRadius: 2, fontSize: '0.65rem', fontWeight: 600, fontFamily: 'var(--mono)', letterSpacing: '0.05em',
            background: s.isTrading ? 'rgba(63,185,80,0.12)' : 'rgba(139,148,158,0.1)',
            color: s.isTrading ? 'var(--positive)' : 'var(--text-muted)',
            border: s.isTrading ? '1px solid rgba(63,185,80,0.3)' : '1px solid var(--border)',
          }}>
            {s.isTrading ? 'LIVE' : 'OFF'}
          </span>
        </td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          {(() => {
            const disp = formatMaxLossDisplay(strategySl[s.id], s.rc, lot);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                <Mono color="var(--negative)" size="0.82rem">{disp.primary}</Mono>
                {disp.hint && (
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{disp.hint}</span>
                )}
              </div>
            );
          })()}
        </td>
        <td style={{ ...tdStyle, textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn-sm" onClick={() => openEditLimits({ id: s.id, ...(s.rc || {}), max_daily_loss: s.rc?.max_daily_loss ?? -10000, max_orders_per_sec: s.rc?.max_orders_per_sec ?? 5, max_trades_per_day: s.rc?.max_trades_per_day ?? 50, retry_wait_sec: s.rc?.retry_wait_sec ?? 5 })} style={{ background: 'rgba(34,211,238,0.15)', color: 'var(--accent)' }}>Limits</button>
            <button className="btn-sm" onClick={() => squareOff(s.id)} style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>SquareOff</button>
            <button
              className="btn-sm"
              onClick={() => rerunNow(s.id)}
              disabled={!s.backendOn || !strategyWorkerOk || !!rerunBusyById[s.id]}
              title={
                !s.backendOn
                  ? 'Enable Backend strategy toggle first'
                  : !strategyWorkerOk
                    ? `Strategy worker ${strategyWorkerStatus || 'offline'}`
                    : 'Manual override: run now (flat-only)'
              }
              style={{
                background: 'rgba(147,51,234,0.16)',
                color: '#c4b5fd',
                opacity: (!s.backendOn || !strategyWorkerOk || !!rerunBusyById[s.id]) ? 0.5 : 1,
                cursor: (!s.backendOn || !strategyWorkerOk || !!rerunBusyById[s.id]) ? 'not-allowed' : 'pointer',
              }}
            >
              {rerunBusyById[s.id] ? '...' : 'Re-run'}
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Status bar — ticker style */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
        padding: '0.5rem 0.9rem', background: 'var(--bg-panel)',
        border: '1px solid var(--border)', borderRadius: 4, gap: '0.65rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <StatusDot active={backendStrategies.length > 0} />
            <Mono size="0.7rem" color="var(--text-muted)">BE</Mono>
            <Mono size="0.7rem">{backendStrategies.length > 0 ? 'UP' : '—'}</Mono>
          </div>
          <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <StatusDot active={!rmsError} />
            <Mono size="0.7rem" color="var(--text-muted)">RMS</Mono>
            <Mono size="0.7rem" color={rmsError ? 'var(--negative)' : 'var(--positive)'}>{rmsError ? 'DOWN' : 'UP'}</Mono>
          </div>
          <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <StatusDot active={isMarketOpen()} blink={isMarketOpen()} />
            <Mono size="0.7rem" color="var(--text-muted)">MKT</Mono>
            <Mono size="0.7rem" color={isMarketOpen() ? 'var(--positive)' : 'var(--text-muted)'}>{isMarketOpen() ? 'OPEN' : 'CLOSED'}</Mono>
          </div>
        </div>
        <Mono color="var(--text-muted)" size="0.72rem" style={{ letterSpacing: '0.08em' }}>
          {clock.toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' })} IST
        </Mono>
      </div>

      {success && (
        <div style={{ padding: '0.35rem 0.65rem', background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.3)', borderRadius: 3, fontSize: '0.72rem', color: 'var(--positive)', fontFamily: 'var(--mono)' }}>{success}</div>
      )}

      {/* Strategy matrix: config + risk in one table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 4 }}>
        <PanelHeader icon="◉" title="STRATEGIES — Setup & Risk">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Mono color="var(--text-muted)" size="0.65rem">DTE</Mono>
              <select
                value={dteFilter}
                onChange={(e) => setDteFilter(e.target.value)}
                style={{ padding: '0.2rem 0.4rem', fontSize: '0.72rem', fontFamily: 'var(--mono)' }}
              >
                {DTE_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <Mono color="var(--text-muted)" size="0.65rem">
              {visibleStrategies.filter(s => s.isTrading).length} trading · {visibleStrategies.length} shown
              {dteFilter !== DTE_FILTERS.ALL ? ` · ${mergedStrategies.length} total` : ''}
            </Mono>
          </div>
        </PanelHeader>
        <div style={{ overflowX: 'auto' }}>
          <table className="setup-matrix-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            {anySectionOpen && (
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.25)' }}>
                <th style={thStyle}>STRATEGY</th>
                <th style={thStyle}>ENTRY</th>
                <th style={thStyle}>EXIT</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>LOT</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>QTY</th>
                <th style={{ ...thStyle, textAlign: 'right' }} title="Lots × ₹1.8L (0DTE) or ₹1.1L (1–2 DTE)">BASE CAPITAL</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>SYMBOL</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>BACKEND</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>RMS CODE</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>RMS ORDERS</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>STATUS</th>
                <th style={{ ...thStyle, textAlign: 'right' }} title="Strategy SL (= RMS for rupee SL)">MAX LOSS</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>ACTIONS</th>
              </tr>
            </thead>
            )}
            {visibleStrategies.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={SETUP_MATRIX_COL_COUNT} className="setup-dte-section__empty">
                    No strategies match this DTE filter
                  </td>
                </tr>
              </tbody>
            ) : (
              setupGroups.flatMap((group) => {
                const groupBooks = uniqueSectionBooks(group.sections);
                const groupLive = groupBooks.filter((strategy) => strategy?.isTrading).length;
                const rows = [(
                  <tbody key={`${group.id}-header`}>
                    <tr className="setup-dte-section__header-row">
                      <td colSpan={SETUP_MATRIX_COL_COUNT} className="setup-dte-section__cell">
                        <div className="setup-dte-section__header setup-dte-section__header--group">
                          <div className="setup-dte-section__toggle">
                            <span className="setup-dte-section__label">{group.label}</span>
                            <span className="setup-dte-section__meta">
                              {group.sections.length} section{group.sections.length === 1 ? '' : 's'}
                            </span>
                            <span className="setup-dte-section__live">
                              {groupLive}/{groupBooks.length} live
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                )];
                return rows.concat(group.sections.flatMap((section) => {
                const bodyId = `setup-dte-section-${section.id}`;
                const collapsible = section.collapsible !== false;
                const collapsed = collapsible && !openSections.has(section.id);
                const count = section.strategies.length;
                const blocks = [];
                if (collapsible) {
                  const allLive = count > 0 && section.liveCount === count;
                  blocks.push(
                    <tbody key={`${section.id}-header`}>
                      <tr className="setup-dte-section__header-row">
                        <td colSpan={SETUP_MATRIX_COL_COUNT} className="setup-dte-section__cell">
                          <div className="setup-dte-section__header setup-dte-section__header--nested">
                            <button
                              type="button"
                              className="setup-dte-section__toggle"
                              onClick={() => toggleDteSection(section.id)}
                              aria-expanded={!collapsed}
                              aria-controls={bodyId}
                              id={`${bodyId}-toggle`}
                            >
                              <span className="setup-dte-section__chevron" aria-hidden="true">
                                {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                              </span>
                              <span className="setup-dte-section__label">{section.label}</span>
                              {!section.familyToggle && (
                                <span className="setup-dte-section__meta">
                                  {count} strateg{count === 1 ? 'y' : 'ies'}
                                </span>
                              )}
                              <span className="setup-dte-section__live">
                                {section.familyToggle ? `${section.liveCount}/${count} live` : `${section.liveCount} live`}
                              </span>
                            </button>
                            {section.familyToggle && (
                              <span
                                className="setup-dte-section__controls"
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => event.stopPropagation()}
                              >
                                {[
                                  ['lot_size', 'Lots', '1'],
                                  ['max_daily_loss', 'Loss/lot', '-10000'],
                                  ['max_orders_per_sec', 'Ord/s', '5'],
                                  ['max_trades_per_day', 'Trades', '50'],
                                  ['retry_wait_sec', 'Retry', '5'],
                                ].map(([key, label, placeholder]) => (
                                  <label key={key} className="setup-dte-section__field">
                                    {label}
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      placeholder={placeholder}
                                      data-wide={key === 'max_daily_loss' ? 'true' : undefined}
                                      aria-label={`${section.label} ${label}`}
                                      value={familyForms[section.id]?.[key] ?? ''}
                                      onChange={(event) => setFamilyForms((prev) => ({
                                        ...prev,
                                        [section.id]: { ...(prev[section.id] || {}), [key]: event.target.value },
                                      }))}
                                    />
                                  </label>
                                ))}
                                <button
                                  type="button"
                                  disabled={familyLimitsBusy === section.id}
                                  onClick={() => applyFamilyLimits(section)}
                                  style={{ fontSize: '0.65rem', padding: '0.2rem 0.45rem' }}
                                >
                                  {familyLimitsBusy === section.id ? 'Saving' : 'Apply'}
                                </button>
                                <MiniToggle
                                  checked={allLive}
                                  onChange={() => setFamilyLive(section.strategies, !allLive)}
                                  label={familyBusy ? '...' : (allLive ? 'ON' : 'OFF')}
                                />
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    </tbody>,
                  );
                }
                blocks.push(
                  <tbody key={`${section.id}-body`} id={bodyId} hidden={collapsed || undefined}>
                    {section.strategies.map((s) => renderStrategyRow(s, section.id))}
                  </tbody>,
                );
                return blocks;
              }));
              })
            )}
          </table>
        </div>
      </div>

      {/* Account + Global limits */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
          <PanelHeader icon="⚡" title="ACCOUNT">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label className="toggle-switch">
                <input type="checkbox" checked={rmsConfig?.account_enabled ?? true} onChange={toggleAccount} />
                <span className="toggle-slider"></span>
              </label>
              <button
                onClick={killAccount}
                style={{
                  background: 'linear-gradient(135deg, #dc2626, #991b1b)',
                  color: '#fff', border: 'none', padding: '0.35rem 0.75rem', borderRadius: 4,
                  fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.05em', cursor: 'pointer',
                  boxShadow: '0 0 8px rgba(220,38,38,0.35)',
                  transition: 'box-shadow 0.2s',
                }}
                onMouseOver={e => { e.target.style.boxShadow = '0 0 14px rgba(220,38,38,0.6)'; }}
                onMouseOut={e => { e.target.style.boxShadow = '0 0 8px rgba(220,38,38,0.35)'; }}
              >
                ⊘ SQUARE OFF ALL POSITIONS
              </button>
            </div>
          </PanelHeader>
          <div style={{ padding: '0.75rem 1rem', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)', lineHeight: 1.5 }}>
            Master switch. <strong style={{ color: 'var(--warning)' }}>SQUARE OFF ALL POSITIONS</strong> — flattens open positions then disables all trading.
          </div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
          <PanelHeader icon="⊞" title="GLOBAL LIMITS">
            <button className="btn-sm" onClick={saveGlobal} disabled={saving}>{saving ? '...' : 'Save'}</button>
          </PanelHeader>
          <div style={{ padding: '0.75rem 1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Max Qty/Order</label>
              <input type="number" value={maxQty} onChange={e => setMaxQty(Number(e.target.value))} style={{ width: '100%', padding: '0.35rem' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Max Loss Overall (₹)</label>
              <input type="number" value={maxLossOverall} onChange={e => setMaxLossOverall(Number(e.target.value))} style={{ width: '100%', padding: '0.35rem' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Max Orders/sec</label>
              <input type="number" value={maxRateAccount} onChange={e => setMaxRateAccount(Number(e.target.value))} style={{ width: '100%', padding: '0.35rem' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Holidays</label>
              <input type="text" value={holidays} onChange={e => setHolidays(e.target.value)} placeholder="2026-03-10, 2026-03-30" style={{ width: '100%', padding: '0.35rem' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Decision tape (collapsible) */}
      <details style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <summary style={{ padding: '0.45rem 0.75rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.65rem', color: 'var(--accent-cyan)', fontFamily: 'var(--mono)', letterSpacing: '0.08em' }}>
          ◎ RMS DECISION TAPE ({decisions.length})
        </summary>
        <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '0.45rem', marginBottom: '0.5rem' }}>
            {['ALL', 'APPROVED', 'REJECTED'].map(k => (
              <button key={k} type="button" onClick={() => setDecisionFilter(k)}
                style={{ padding: '0.25rem 0.55rem', fontSize: '0.7rem', borderRadius: 4, border: decisionFilter === k ? '1px solid var(--accent)' : '1px solid var(--border)' }}>{k}</button>
            ))}
            <input value={decisionSearch} onChange={e => setDecisionSearch(e.target.value)} placeholder="Search..." style={{ marginLeft: 'auto', minWidth: 160 }} />
          </div>
          <div style={{ maxHeight: 240, overflow: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.25)' }}>
                  <th style={thStyle}>TIME</th>
                  <th style={thStyle}>STRATEGY</th>
                  <th style={thStyle}>DECISION</th>
                  <th style={thStyle}>REASON</th>
                </tr>
              </thead>
              <tbody>
                {filteredDecisions.slice(0, 50).map((d, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(51,65,85,0.35)' }}>
                    <td style={tdStyle}><Mono size="0.75rem">{toISTCompact(d.ts)}</Mono></td>
                    <td style={tdStyle}>{getStrategyDisplayName(d.strategy_id)}</td>
                    <td style={tdStyle}>
                      <span style={{ color: d.decision === 'APPROVED' ? 'var(--positive)' : 'var(--negative)' }}>{d.decision}</span>
                    </td>
                    <td style={tdStyle}><Mono size="0.75rem">{d.reason_code || '—'}</Mono></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      {/* Edit Limits modal */}
      {editLimits && (
        <div className="modal-overlay" onClick={() => setEditLimits(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3>Risk Limits — {getStrategyDisplayName(editLimits)}</h3>
            <form onSubmit={saveStratLimits}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {(() => {
                  const sl = strategySl[editLimits];
                  const synced = isRupeeSl(sl);
                  return [
                    { key: 'max_daily_loss', label: synced ? 'Max Loss/Day per lot (₹, synced)' : 'Max Loss/Day per lot (₹)', readOnly: synced },
                    { key: 'max_orders_per_sec', label: 'Max Orders/sec' },
                    { key: 'max_trades_per_day', label: 'Max Trades/Day' },
                    { key: 'retry_wait_sec', label: 'Retry Wait (sec)' },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{f.label}</label>
                      <input
                        type="number"
                        value={stratForm[f.key]}
                        readOnly={!!f.readOnly}
                        disabled={!!f.readOnly}
                        onChange={e => setStratForm(p => ({ ...p, [f.key]: e.target.value }))}
                        style={{ width: '100%', padding: '0.5rem', opacity: f.readOnly ? 0.7 : 1 }}
                      />
                    </div>
                  ));
                })()}
              </div>
              {(() => {
                const row = mergedStrategies.find((x) => x.id === editLimits);
                const underlying = Number(row?.bc?.underlying_scrip ?? 13);
                const mult = getContractMultiplier(underlying, symbols);
                const lot = Math.max(1, lotSizes[editLimits] ?? row?.rc?.lot_size ?? (row?.rc?.order_quantity ? Math.round(row.rc.order_quantity / mult) : 1));
                const sl = strategySl[editLimits];
                const disp = formatMaxLossDisplay(sl, { max_daily_loss: stratForm.max_daily_loss }, lot);
                return (
                  <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {isRupeeSl(sl)
                      ? 'Synced from strategy SL (strategies.json) — RMS Layer 2 uses the same threshold.'
                      : 'Pct strategy: set RMS rupee backstop manually (whichever hits first).'}
                    {' '}Effective: <Mono color="var(--negative)" size="0.75rem">{disp.primary}</Mono>
                  </p>
                );
              })()}
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => setEditLimits(null)}>Cancel</button>
                <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Apply'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
