import { useState, useEffect, useCallback, useRef } from 'react';
import { toISTCompact } from '../utils/formatIST';
import { RMS_API } from '../config/deskApi';
import { getStrategyDisplayName, strategyMatchesSearch } from '../lib/strategyDisplayNames';

/* ─── Micro-components ─── */
const Mono = ({ children, color, size = '0.85rem' }) => (
    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: size, color, fontVariantNumeric: 'tabular-nums' }}>{children}</span>
);

const StatusDot = ({ active }) => (
    <span style={{
        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
        background: active ? '#34d399' : '#f87171',
        boxShadow: active ? '0 0 8px rgba(52,211,153,0.6)' : '0 0 8px rgba(248,113,113,0.6)',
        animation: active ? 'pulse 2s ease-in-out infinite' : 'none',
    }} />
);

const PanelHeader = ({ icon, title, children }) => (
    <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.3)',
        borderBottom: '1px solid var(--border)', borderRadius: '8px 8px 0 0',
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {icon} {title}
            </span>
        </div>
        {children}
    </div>
);

const RiskBadge = ({ level }) => {
    const colors = { LOW: '#34d399', MEDIUM: '#fbbf24', HIGH: '#f87171', CRITICAL: '#dc2626' };
    const bg = { LOW: 'rgba(52,211,153,0.12)', MEDIUM: 'rgba(251,191,36,0.12)', HIGH: 'rgba(248,113,113,0.12)', CRITICAL: 'rgba(220,38,38,0.2)' };
    return (
        <span style={{
            padding: '0.15rem 0.5rem', borderRadius: 3, fontSize: '0.65rem', fontWeight: 700,
            letterSpacing: '0.08em', background: bg[level] || bg.LOW, color: colors[level] || colors.LOW,
            border: `1px solid ${colors[level] || colors.LOW}40`,
        }}>
            {level}
        </span>
    );
};

const MiniToggle = ({ checked, onChange, label }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <label className="toggle-switch" style={{ width: 32, height: 18 }}>
            <input type="checkbox" checked={checked} onChange={onChange} />
            <span className="toggle-slider" style={{ borderRadius: 18 }}>
                <style>{`.toggle-slider::before { width: 12px !important; height: 12px !important; }`}</style>
            </span>
        </label>
        <span style={{ fontSize: '0.7rem', color: checked ? 'var(--positive)' : 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
    </div>
);

export default function RiskManagement() {
    const [config, setConfig] = useState(null);
    const [strategies, setStrategies] = useState([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState('');
    const [clock, setClock] = useState(new Date());
    const [expandedRow, setExpandedRow] = useState(null);

    // ─── Editable global fields ───
    const [maxQty, setMaxQty] = useState(900);
    const [maxLossOverall, setMaxLossOverall] = useState(-50000);
    const [maxRateAccount, setMaxRateAccount] = useState(20);
    const [holidays, setHolidays] = useState('');

    // ─── Per-strategy inline edit ───
    const [editStrat, setEditStrat] = useState(null);
    const [stratForm, setStratForm] = useState({});
    const [decisions, setDecisions] = useState([]);
    const [decisionFilter, setDecisionFilter] = useState('ALL');
    const [decisionSearch, setDecisionSearch] = useState('');
    const [loadingDecisions, setLoadingDecisions] = useState(true);
    const decisionIntervalRef = useRef(null);

    const flash = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

    // Real-time clock
    useEffect(() => {
        const t = setInterval(() => setClock(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const loadConfig = useCallback(() => {
        setError(null);
        fetch(`${RMS_API}/config`)
            .then(r => { if (!r.ok) throw new Error('RMS not reachable'); return r.json(); })
            .then(d => {
                setConfig(d);
                setMaxQty(d.max_qty_per_order || 900);
                setMaxLossOverall(Math.abs(d.max_daily_loss_overall || -50000));
                setMaxRateAccount(d.max_orders_per_sec_account || 20);
                setHolidays((d.holidays || []).join(', '));
                setStrategies(Object.entries(d.strategies || {}).map(([id, cfg]) => ({ id, ...cfg })));
            })
            .catch(() => setError('RMS OFFLINE — Service unreachable on port 8001'));
    }, []);

    useEffect(() => { loadConfig(); }, [loadConfig]);

    const loadDecisions = useCallback(() => {
        fetch(`${RMS_API}/decisions?limit=100`)
            .then(r => r.ok ? r.json() : [])
            .then(rows => {
                setDecisions(Array.isArray(rows) ? rows : []);
                setLoadingDecisions(false);
            })
            .catch(() => setLoadingDecisions(false));
    }, []);

    useEffect(() => {
        loadDecisions();
        decisionIntervalRef.current = setInterval(loadDecisions, 5000);
        return () => {
            if (decisionIntervalRef.current) clearInterval(decisionIntervalRef.current);
        };
    }, [loadDecisions]);

    // ─── Handlers ───
    const saveGlobal = async () => {
        setSaving(true);
        const hols = holidays.split(',').map(h => h.trim()).filter(Boolean);
        await fetch(`${RMS_API}/config/limits`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ max_qty_per_order: maxQty, max_daily_loss_overall: -Math.abs(maxLossOverall), max_orders_per_sec_account: maxRateAccount, holidays: hols }),
        });
        setSaving(false);
        flash('✓ Global limits updated');
        loadConfig();
    };

    const toggleAccount = async () => {
        const s = !(config?.account_enabled ?? true);
        await fetch(`${RMS_API}/account/toggle?enabled=${s}`, { method: 'POST' });
        flash(s ? 'Account ENABLED' : 'Account DISABLED');
        loadConfig();
    };

    const killAccount = async () => {
        if (!window.confirm('⚠️ SQUARE OFF ALL POSITIONS — DISABLE ALL TRADING?')) return;
        await fetch(`${RMS_API}/account/kill`, { method: 'POST' });
        flash('🔴 ALL TRADING HALTED');
        loadConfig();
    };

    const toggleCode = async (id, c) => {
        await fetch(`${RMS_API}/strategies/${id}/toggle-code?enabled=${!c}`, { method: 'POST' });
        flash(`${cleanName(id)} code ${!c ? '▶ ON' : '⏸ OFF'}`);
        loadConfig();
    };
    const toggleOrders = async (id, c) => {
        await fetch(`${RMS_API}/strategies/${id}/toggle-orders?enabled=${!c}`, { method: 'POST' });
        flash(`${cleanName(id)} orders ${!c ? '▶ ON' : '⏸ OFF'}`);
        loadConfig();
    };
    const squareOff = async (id) => {
        if (!window.confirm(`FLATTEN all positions for ${id}?`)) return;
        const r = await fetch(`${RMS_API}/strategies/${id}/squareoff`, { method: 'POST' });
        const d = await r.json();
        flash(`${cleanName(id)}: ${d.positions_closed || 0} pos closed`);
        loadConfig();
    };

    const openEdit = (s) => {
        setStratForm({
            max_daily_loss: s.max_daily_loss ?? -10000,
            max_orders_per_sec: s.max_orders_per_sec ?? 5,
            max_trades_per_day: s.max_trades_per_day ?? 50,
            retry_wait_sec: s.retry_wait_sec ?? 5,
        });
        setEditStrat(s.id);
    };
    const saveStratLimits = async (e) => {
        e.preventDefault();
        setSaving(true);
        await fetch(`${RMS_API}/config/limits`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                strategies: {
                    [editStrat]: {
                        max_daily_loss: Number(stratForm.max_daily_loss),
                        max_orders_per_sec: Number(stratForm.max_orders_per_sec),
                        max_trades_per_day: Number(stratForm.max_trades_per_day),
                        retry_wait_sec: Number(stratForm.retry_wait_sec),
                    },
                },
            }),
        });
        setSaving(false);
        setEditStrat(null);
        flash(`✓ ${cleanName(editStrat)} limits saved`);
        loadConfig();
    };

    const cleanName = getStrategyDisplayName;
    const decisionTone = (decision) => {
        if (decision === 'APPROVED') return { bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.4)', color: '#34d399' };
        return { bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.4)', color: '#f87171' };
    };


    const isMarketOpen = () => {
        const h = clock.getHours(), m = clock.getMinutes();
        const day = clock.getDay();
        if (day === 0 || day === 6) return false;
        if (h < 9 || (h === 9 && m < 15)) return false;
        if (h > 15 || (h === 15 && m >= 30)) return false;
        return true;
    };

    const activeStrats = strategies.filter(s => s.code_enabled && s.order_enabled).length;
    const disabledStrats = strategies.length - activeStrats;
    const approvedCount = decisions.filter(d => d.decision === 'APPROVED').length;
    const rejectedCount = decisions.filter(d => d.decision !== 'APPROVED').length;
    const filteredDecisions = decisions.filter(d => {
        const passDecision = decisionFilter === 'ALL' ? true : d.decision === decisionFilter;
        const q = decisionSearch.trim().toLowerCase();
        const passSearch = !q
            || strategyMatchesSearch(d.strategy_id, q)
            || String(d.reason_code || '').toLowerCase().includes(q)
            || String(d.signal_id || '').toLowerCase().includes(q);
        return passDecision && passSearch;
    });

    if (!config && !error) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>
            <Mono color="var(--accent)">INITIALIZING RMS MODULE...</Mono>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

            {/* ══════ TOP STATUS BAR ══════ */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
                padding: '0.6rem 1rem', background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.95))',
                border: '1px solid var(--border)', borderRadius: 8, gap: '0.75rem',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <StatusDot active={!error} />
                        <Mono color={error ? 'var(--negative)' : 'var(--positive)'} size="0.75rem">
                            {error ? 'OFFLINE' : 'RMS ONLINE'}
                        </Mono>
                    </div>
                    <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <StatusDot active={isMarketOpen()} />
                        <Mono color={isMarketOpen() ? 'var(--positive)' : 'var(--text-muted)'} size="0.75rem">
                            {isMarketOpen() ? 'MARKET OPEN' : 'MARKET CLOSED'}
                        </Mono>
                    </div>
                    <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <StatusDot active={config?.account_enabled} />
                        <Mono color={config?.account_enabled ? 'var(--positive)' : 'var(--negative)'} size="0.75rem">
                            {config?.account_enabled ? 'TRADING ON' : 'TRADING OFF'}
                        </Mono>
                    </div>
                </div>
                <Mono color="var(--text-muted)" size="0.75rem">
                    {clock.toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' })} IST
                    &nbsp;│&nbsp;{clock.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </Mono>
            </div>

            {/* Flash messages */}
            {success && (
                <div style={{ padding: '0.4rem 0.75rem', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 4, fontSize: '0.8rem', color: 'var(--positive)' }}>
                    <Mono color="var(--positive)" size="0.8rem">{success}</Mono>
                </div>
            )}
            {error && (
                <div style={{ padding: '0.4rem 0.75rem', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 4, fontSize: '0.8rem', color: 'var(--negative)' }}>
                    <Mono color="var(--negative)" size="0.8rem">⚠ {error}</Mono>
                </div>
            )}

            {/* ══════ KPI ROW ══════ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.6rem' }}>
                {[
                    { label: 'STRATEGIES', value: strategies.length, color: 'var(--accent)' },
                    { label: 'ACTIVE', value: activeStrats, color: 'var(--positive)' },
                    { label: 'DISABLED', value: disabledStrats, color: disabledStrats > 0 ? 'var(--negative)' : 'var(--text-muted)' },
                    { label: 'MAX QTY/ORDER', value: maxQty, color: 'var(--warning)' },
                    { label: 'DAILY LOSS CAP', value: `₹${Math.abs(maxLossOverall).toLocaleString()}`, color: 'var(--negative)' },
                ].map((k, i) => (
                    <div key={i} style={{
                        padding: '0.6rem 0.75rem', background: 'rgba(0,0,0,0.25)',
                        border: '1px solid var(--border)', borderRadius: 6,
                        borderLeft: `3px solid ${k.color}`,
                    }}>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.08em', fontWeight: 600, marginBottom: '0.2rem' }}>{k.label}</div>
                        <Mono color={k.color} size="1.1rem">{k.value}</Mono>
                    </div>
                ))}
            </div>

            {/* ══════ MAIN SPLIT: ACCOUNT CONTROLS + GLOBAL LIMITS ══════ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>

                {/* ── Account Controls Panel ── */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <PanelHeader icon="⚡" title="ACCOUNT CONTROLS" />
                    <div style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>MASTER SWITCH</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <label className="toggle-switch">
                                        <input type="checkbox" checked={config?.account_enabled ?? true} onChange={toggleAccount} />
                                        <span className="toggle-slider"></span>
                                    </label>
                                    <Mono color={config?.account_enabled ? 'var(--positive)' : 'var(--negative)'} size="0.85rem">
                                        {config?.account_enabled ? 'ENABLED' : 'DISABLED'}
                                    </Mono>
                                </div>
                            </div>
                            <button onClick={killAccount} style={{
                                background: 'linear-gradient(135deg, #dc2626, #991b1b)', color: '#fff', border: 'none',
                                padding: '0.6rem 1.5rem', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem',
                                letterSpacing: '0.05em', boxShadow: '0 0 12px rgba(220,38,38,0.3)',
                                transition: 'all 0.2s',
                            }}
                                onMouseOver={e => e.target.style.boxShadow = '0 0 20px rgba(220,38,38,0.6)'}
                                onMouseOut={e => e.target.style.boxShadow = '0 0 12px rgba(220,38,38,0.3)'}
                            >
                                ⊘ SQUARE OFF ALL POSITIONS
                            </button>
                        </div>
                        <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: 4, fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                            <strong style={{ color: 'var(--warning)' }}>⚠ SQUARE OFF ALL POSITIONS</strong> flattens open positions then disables all trading across every strategy.
                            Use only in emergencies — manual re-enable required.
                        </div>
                    </div>
                </div>

                {/* ── Global Risk Limits Panel ── */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <PanelHeader icon="⊞" title="GLOBAL RISK LIMITS">
                        <button onClick={saveGlobal} disabled={saving} style={{
                            padding: '0.25rem 0.75rem', fontSize: '0.7rem', fontWeight: 600,
                            background: 'rgba(34,211,238,0.15)', color: 'var(--accent)', border: '1px solid rgba(34,211,238,0.3)',
                            borderRadius: 4, cursor: 'pointer',
                        }}>
                            {saving ? '...' : '⬆ SAVE'}
                        </button>
                    </PanelHeader>
                    <div style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            {[
                                { label: 'Max Qty / Order', value: maxQty, set: setMaxQty, type: 'number' },
                                { label: 'Max Loss Overall (₹)', value: maxLossOverall, set: setMaxLossOverall, type: 'number' },
                                { label: 'Max Orders/sec', value: maxRateAccount, set: setMaxRateAccount, type: 'number' },
                            ].map((f, i) => (
                                <div key={i}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>{f.label}</div>
                                    <input type={f.type} value={f.value} onChange={e => f.set(Number(e.target.value))}
                                        style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.85rem', fontFamily: "'IBM Plex Mono', monospace", background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)' }}
                                    />
                                </div>
                            ))}
                            <div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>Holidays</div>
                                <input type="text" value={holidays} onChange={e => setHolidays(e.target.value)} placeholder="2026-03-10, 2026-03-30"
                                    style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.8rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)' }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ══════ STRATEGY RISK MATRIX ══════ */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <PanelHeader icon="◉" title={`STRATEGY RISK MATRIX · ${strategies.length} STRATEGIES`}>
                    <Mono color="var(--text-muted)" size="0.65rem">
                        {activeStrats} active · {disabledStrats} disabled
                    </Mono>
                </PanelHeader>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                            <tr style={{ background: 'rgba(0,0,0,0.25)' }}>
                                <th style={thStyle}>STRATEGY</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>CODE</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>ORDERS</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>MAX LOSS/DAY</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>MAX TRADES</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>RATE (/s)</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>RETRY</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {strategies.map(s => (
                                <tr key={s.id} style={{
                                    borderBottom: '1px solid rgba(51,65,85,0.5)',
                                    transition: 'background 0.15s',
                                    background: expandedRow === s.id ? 'rgba(34,211,238,0.05)' : 'transparent',
                                }}
                                    onMouseOver={e => { if (expandedRow !== s.id) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                                    onMouseOut={e => { if (expandedRow !== s.id) e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <td style={tdStyle}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{
                                                width: 3, height: 20, borderRadius: 2,
                                                background: (s.code_enabled && s.order_enabled) ? 'var(--positive)' : 'var(--negative)',
                                            }} />
                                            <Mono size="0.82rem" color="var(--text)">{cleanName(s.id)}</Mono>
                                        </div>
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                        <MiniToggle checked={s.code_enabled ?? true} onChange={() => toggleCode(s.id, s.code_enabled ?? true)} label={s.code_enabled ? 'ON' : 'OFF'} />
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                        <MiniToggle checked={s.order_enabled ?? true} onChange={() => toggleOrders(s.id, s.order_enabled ?? true)} label={s.order_enabled ? 'ON' : 'OFF'} />
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                                        {(() => {
                                            const lot = Math.max(1, Number(s.lot_size) || 1);
                                            const perLot = Math.abs(s.max_daily_loss ?? 10000);
                                            const effective = perLot * lot;
                                            return (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                                                    <Mono color="var(--negative)" size="0.82rem">₹{effective.toLocaleString()}</Mono>
                                                    {lot > 1 && (
                                                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                                            ₹{perLot.toLocaleString()}×{lot}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                        <Mono size="0.82rem">{s.max_trades_per_day ?? 50}</Mono>
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                        <Mono size="0.82rem">{s.max_orders_per_sec ?? 5}</Mono>
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                        <Mono color="var(--text-muted)" size="0.82rem">{s.retry_wait_sec ?? 5}s</Mono>
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                                            <button onClick={() => openEdit(s)} style={{
                                                padding: '0.2rem 0.5rem', fontSize: '0.7rem', fontWeight: 600,
                                                background: 'rgba(34,211,238,0.1)', color: 'var(--accent)',
                                                border: '1px solid rgba(34,211,238,0.25)', borderRadius: 3, cursor: 'pointer',
                                            }}>✎ EDIT</button>
                                            <button onClick={() => squareOff(s.id)} style={{
                                                padding: '0.2rem 0.5rem', fontSize: '0.7rem', fontWeight: 600,
                                                background: 'rgba(239,68,68,0.15)', color: '#f87171',
                                                border: '1px solid rgba(239,68,68,0.25)', borderRadius: 3, cursor: 'pointer',
                                            }}>⊘ FLAT</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {strategies.length === 0 && (
                                <tr>
                                    <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                                        <Mono color="var(--text-muted)" size="0.8rem">NO STRATEGIES REGISTERED · Waiting for backend sync...</Mono>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ══════ RMS DECISION TAPE ══════ */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <PanelHeader icon="◎" title="RMS DECISION TAPE (LIVE)">
                    <Mono color="var(--text-muted)" size="0.65rem">
                        Auto refresh 5s
                    </Mono>
                </PanelHeader>

                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(51,65,85,0.4)', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '0.6rem' }}>
                    <div style={{ padding: '0.45rem 0.6rem', border: '1px solid rgba(34,211,238,0.3)', borderRadius: 6, background: 'rgba(34,211,238,0.07)' }}>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>TOTAL DECISIONS</div>
                        <Mono color="var(--accent)" size="0.95rem">{decisions.length}</Mono>
                    </div>
                    <div style={{ padding: '0.45rem 0.6rem', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 6, background: 'rgba(52,211,153,0.07)' }}>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>APPROVED</div>
                        <Mono color="var(--positive)" size="0.95rem">{approvedCount}</Mono>
                    </div>
                    <div style={{ padding: '0.45rem 0.6rem', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 6, background: 'rgba(248,113,113,0.07)' }}>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>REJECTED</div>
                        <Mono color="var(--negative)" size="0.95rem">{rejectedCount}</Mono>
                    </div>
                    <div style={{ padding: '0.45rem 0.6rem', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 6, background: 'rgba(148,163,184,0.06)' }}>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>LATEST EVENT</div>
                        <Mono color="var(--text)" size="0.82rem">{decisions[0]?.ts ? toISTCompact(decisions[0].ts) : '—'}</Mono>
                    </div>
                </div>

                <div style={{ padding: '0.55rem 1rem', display: 'flex', gap: '0.45rem', alignItems: 'center', borderBottom: '1px solid rgba(51,65,85,0.4)' }}>
                    {['ALL', 'APPROVED', 'REJECTED'].map(k => (
                        <button
                            key={k}
                            type="button"
                            onClick={() => setDecisionFilter(k)}
                            style={{
                                padding: '0.25rem 0.55rem',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                borderRadius: 4,
                                border: decisionFilter === k ? '1px solid rgba(34,211,238,0.5)' : '1px solid var(--border)',
                                background: decisionFilter === k ? 'rgba(34,211,238,0.12)' : 'rgba(0,0,0,0.15)',
                                color: decisionFilter === k ? 'var(--accent)' : 'var(--text-muted)',
                                cursor: 'pointer',
                            }}
                        >
                            {k}
                        </button>
                    ))}
                    <input
                        value={decisionSearch}
                        onChange={(e) => setDecisionSearch(e.target.value)}
                        placeholder="Search strategy / reason / signal..."
                        style={{ marginLeft: 'auto', minWidth: 260 }}
                    />
                </div>

                <div style={{ maxHeight: 340, overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                            <tr style={{ background: 'rgba(0,0,0,0.25)' }}>
                                <th style={thStyle}>TIME (IST)</th>
                                <th style={thStyle}>STRATEGY</th>
                                <th style={thStyle}>DECISION</th>
                                <th style={thStyle}>REASON</th>
                                <th style={thStyle}>CHECKS FAILED</th>
                                <th style={thStyle}>CHECKS PASSED</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loadingDecisions ? (
                                <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center' }}><Mono color="var(--text-muted)">Loading RMS decisions...</Mono></td></tr>
                            ) : filteredDecisions.length === 0 ? (
                                <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center' }}><Mono color="var(--text-muted)">No matching decisions.</Mono></td></tr>
                            ) : (
                                filteredDecisions.map((d, idx) => {
                                    const tone = decisionTone(d.decision);
                                    return (
                                        <tr key={`${d.signal_id || 'na'}-${idx}`} style={{ borderBottom: '1px solid rgba(51,65,85,0.35)' }}>
                                            <td style={tdStyle}><Mono color="var(--text-muted)" size="0.75rem">{toISTCompact(d.ts)}</Mono></td>
                                            <td style={tdStyle}><Mono size="0.8rem">{cleanName(d.strategy_id || '—')}</Mono></td>
                                            <td style={tdStyle}>
                                                <span style={{ padding: '0.12rem 0.45rem', borderRadius: 4, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                                                    {d.decision || '—'}
                                                </span>
                                            </td>
                                            <td style={tdStyle}><Mono color="var(--warning)" size="0.75rem">{d.reason_code || 'OK'}</Mono></td>
                                            <td style={tdStyle}><Mono color="var(--negative)" size="0.75rem">{(d.checks_failed || []).join(', ') || '—'}</Mono></td>
                                            <td style={tdStyle}><Mono color="var(--positive)" size="0.75rem">{(d.checks_passed || []).length}</Mono></td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ══════ EDIT MODAL ══════ */}
            {editStrat && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
                }} onClick={() => setEditStrat(null)}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
                        border: '1px solid var(--border)', borderRadius: 10, width: 440, maxWidth: '95vw',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(34,211,238,0.1)',
                    }}>
                        <div style={{
                            padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--accent)', letterSpacing: '0.08em', fontWeight: 600 }}>RISK PARAMETERS</div>
                                <Mono size="1rem" color="var(--text)">{cleanName(editStrat)}</Mono>
                            </div>
                            <button onClick={() => setEditStrat(null)} style={{
                                background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
                                width: 28, height: 28, borderRadius: 4, cursor: 'pointer', fontSize: '0.9rem',
                            }}>×</button>
                        </div>
                        <form onSubmit={saveStratLimits} style={{ padding: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                {[
                                    { key: 'max_daily_loss', label: 'Max Loss/Day (₹)', color: 'var(--negative)' },
                                    { key: 'max_orders_per_sec', label: 'Max Orders/sec', color: 'var(--accent)' },
                                    { key: 'max_trades_per_day', label: 'Max Trades/Day', color: 'var(--warning)' },
                                    { key: 'retry_wait_sec', label: 'Retry Wait (sec)', color: 'var(--text-muted)' },
                                ].map(f => (
                                    <div key={f.key}>
                                        <div style={{ fontSize: '0.65rem', color: f.color, letterSpacing: '0.04em', marginBottom: '0.25rem', fontWeight: 600 }}>{f.label}</div>
                                        <input type="number" value={stratForm[f.key]}
                                            onChange={e => setStratForm(p => ({ ...p, [f.key]: e.target.value }))}
                                            style={{
                                                width: '100%', padding: '0.5rem', fontSize: '1rem',
                                                fontFamily: "'IBM Plex Mono', monospace",
                                                background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border)',
                                                borderRadius: 4, color: 'var(--text)',
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                <button type="button" onClick={() => setEditStrat(null)} style={{
                                    padding: '0.45rem 1rem', background: 'transparent', border: '1px solid var(--border)',
                                    color: 'var(--text-muted)', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem',
                                }}>Cancel</button>
                                <button type="submit" disabled={saving} style={{
                                    padding: '0.45rem 1.25rem', background: 'var(--accent)', color: '#0f172a',
                                    border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem',
                                }}>{saving ? 'Saving...' : '✓ Apply'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

const thStyle = {
    padding: '0.5rem 0.75rem', fontSize: '0.65rem', fontWeight: 700,
    letterSpacing: '0.08em', color: 'var(--text-muted)',
    borderBottom: '2px solid var(--border)', textTransform: 'uppercase',
    whiteSpace: 'nowrap',
};

const tdStyle = {
    padding: '0.55rem 0.75rem', borderBottom: '1px solid rgba(51,65,85,0.4)',
    whiteSpace: 'nowrap',
};
