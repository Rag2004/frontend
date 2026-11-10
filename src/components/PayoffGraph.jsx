import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis,
    CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import {
    INDEX_FILTERS,
    buildStrategyUnderlyingMap,
    indexFilterDisplayName,
    indexFilterForStrategy,
    NIFTY_SCRIP,
    SENSEX_SCRIP,
    strategyMatchesIndex,
} from '../lib/indexFilter';
import { API } from '../config/deskApi';

import { getStrategyDisplayName as cleanName } from '../lib/strategyDisplayNames';

const Mono = ({ children, color, size = '0.85rem' }) => (
    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: size, color, fontVariantNumeric: 'tabular-nums' }}>{children}</span>
);

const LEG_COLORS = ['#22d3ee', '#34d399', '#f87171', '#fbbf24', '#a78bfa', '#fb923c', '#e879f9', '#6ee7b7'];

export default function PayoffGraph({
    embedded = false,
    strategyFilter = null,
}) {
    const [positions, setPositions] = useState([]);
    const [spotPrice, setSpotPrice] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selectedStrats, setSelectedStrats] = useState(new Set());
    const [indexFilter, setIndexFilter] = useState(INDEX_FILTERS.ALL);
    const [strategyUnderlyingById, setStrategyUnderlyingById] = useState({});

    const loadData = useCallback(() => {
        fetch(`${API}/payoff-data`)
            .then(r => r.json())
            .then(d => {
                const allPos = d.positions || [];
                const posByStrategy = strategyFilter
                    ? allPos.filter(p => p.strategy_id === strategyFilter)
                    : allPos;
                const pos = posByStrategy.filter((p) =>
                    strategyMatchesIndex(p.strategy_id, indexFilter, strategyUnderlyingById)
                );
                setPositions(pos);
                const prices = d.underlying_prices || {};
                const pick = indexFilter === INDEX_FILTERS.NIFTY
                    ? prices[String(NIFTY_SCRIP)]
                    : indexFilter === INDEX_FILTERS.SENSEX
                        ? prices[String(SENSEX_SCRIP)]
                        : prices[Object.keys(prices)[0]];
                setSpotPrice(Number(pick || 0));
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [strategyFilter, indexFilter, strategyUnderlyingById]);

    useEffect(() => { loadData(); }, [loadData]);
    useEffect(() => {
        fetch(`${API}/strategy-configs`)
            .then((r) => r.json())
            .then((d) => setStrategyUnderlyingById(buildStrategyUnderlyingMap(d.configs || [])))
            .catch(() => setStrategyUnderlyingById({}));
    }, []);

    useEffect(() => {
        if (strategyFilter) {
            setIndexFilter(indexFilterForStrategy(strategyFilter, strategyUnderlyingById));
        } else {
            setIndexFilter(INDEX_FILTERS.ALL);
        }
    }, [strategyFilter, strategyUnderlyingById]);

    useEffect(() => {
        const strats = new Set(positions.map(p => p.strategy_id));
        if (strategyFilter) {
            setSelectedStrats(new Set([strategyFilter]));
        } else {
            setSelectedStrats(strats);
        }
    }, [positions, strategyFilter]);

    // Compute payoff data
    const { payoffData, strategies, breakevens } = useMemo(() => {
        if (!positions.length || !spotPrice) return { payoffData: [], strategies: [], breakevens: [] };

        const range = 3000; // ±3000 from spot
        const steps = 200;
        const stepSize = (range * 2) / steps;
        const startPrice = spotPrice - range;

        const stratSet = new Set(positions.map(p => p.strategy_id));
        const stratArr = Array.from(stratSet);

        const points = [];
        for (let i = 0; i <= steps; i++) {
            const expPrice = startPrice + i * stepSize;
            const row = { price: Math.round(expPrice * 100) / 100, combined: 0 };

            for (const sid of stratArr) {
                let stratPnl = 0;
                const stratPositions = positions.filter(p => p.strategy_id === sid && p.strike && p.option_type);
                for (const pos of stratPositions) {
                    const { strike, option_type, side, quantity, avg_price } = pos;
                    const intrinsic =
                        option_type === 'CE'
                            ? Math.max(0, expPrice - strike)
                            : Math.max(0, strike - expPrice);
                    const pnl =
                        side === 'SELL'
                            ? (avg_price - intrinsic) * quantity
                            : (intrinsic - avg_price) * quantity;
                    stratPnl += pnl;
                }
                row[`strat_${sid}`] = Math.round(stratPnl);
                row.combined += stratPnl;
            }
            row.combined = Math.round(row.combined);
            points.push(row);
        }

        // Find breakeven points (where combined crosses 0)
        const bkevens = [];
        for (let i = 1; i < points.length; i++) {
            if ((points[i - 1].combined <= 0 && points[i].combined > 0) ||
                (points[i - 1].combined >= 0 && points[i].combined < 0)) {
                bkevens.push(Math.round(points[i].price));
            }
        }

        return { payoffData: points, strategies: stratArr, breakevens: bkevens };
    }, [positions, spotPrice]);

    const toggleStrat = (sid) => {
        setSelectedStrats(prev => {
            const next = new Set(prev);
            if (next.has(sid)) next.delete(sid);
            else next.add(sid);
            return next;
        });
    };

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null;
        return (
            <div style={{
                background: 'rgba(15,23,42,0.95)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '0.6rem 0.8rem', fontSize: '0.75rem',
            }}>
                <div style={{ marginBottom: '0.4rem' }}>
                    <Mono size="0.75rem" color="var(--text)">Spot: {Number(label).toFixed(0)}</Mono>
                </div>
                {payload.map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                        <span style={{ color: p.color, fontSize: '0.7rem' }}>{p.name}</span>
                        <Mono color={p.value >= 0 ? 'var(--positive)' : 'var(--negative)'} size="0.7rem">
                            ₹{p.value?.toLocaleString()}
                        </Mono>
                    </div>
                ))}
            </div>
        );
    };

    // Summary stats
    const maxProfit = payoffData.length ? Math.max(...payoffData.map(p => p.combined)) : 0;
    const maxLoss = payoffData.length ? Math.min(...payoffData.map(p => p.combined)) : 0;

    return (
        <div style={{ background: embedded ? 'transparent' : 'var(--bg-card)', border: embedded ? 'none' : '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
                padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.3)',
                borderBottom: '1px solid var(--border)', gap: '0.5rem',
            }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.06em' }}>
                    ◉ PAYOFF AT EXPIRY
                </span>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    {strategyFilter ? (
                        <Mono color="var(--text-muted)" size="0.7rem">
                            Underlying: {indexFilterDisplayName(indexFilter)}
                        </Mono>
                    ) : (
                        <select
                            value={indexFilter}
                            onChange={(e) => setIndexFilter(e.target.value)}
                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)' }}
                        >
                            <option value={INDEX_FILTERS.ALL}>All</option>
                            <option value={INDEX_FILTERS.NIFTY}>Nifty</option>
                            <option value={INDEX_FILTERS.SENSEX}>Sensex</option>
                        </select>
                    )}
                    {spotPrice > 0 && (
                        <Mono color="var(--warning)" size="0.7rem">SPOT: {spotPrice.toFixed(2)}</Mono>
                    )}
                    {breakevens.length > 0 && (
                        <Mono color="var(--text-muted)" size="0.7rem">
                            BE: {breakevens.join(' / ')}
                        </Mono>
                    )}
                </div>
            </div>

            {/* KPI strip */}
            {payoffData.length > 0 && (
                <div style={{ display: 'flex', gap: '0.75rem', padding: '0.4rem 0.75rem', borderBottom: '1px solid rgba(51,65,85,0.3)' }}>
                    <div>
                        <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>MAX PROFIT</div>
                        <Mono color="var(--positive)" size="0.85rem">₹{maxProfit.toLocaleString()}</Mono>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>MAX LOSS</div>
                        <Mono color="var(--negative)" size="0.85rem">₹{maxLoss.toLocaleString()}</Mono>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>POSITIONS</div>
                        <Mono size="0.85rem">{positions.length}</Mono>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>BREAKEVEN</div>
                        <Mono color="var(--warning)" size="0.85rem">{breakevens.length > 0 ? breakevens.join(' / ') : '—'}</Mono>
                    </div>
                </div>
            )}

            {/* Strategy filter */}
            {!strategyFilter && strategies.length > 1 && (
                <div style={{ padding: '0.4rem 0.75rem', display: 'flex', gap: '0.3rem', flexWrap: 'wrap', borderBottom: '1px solid rgba(51,65,85,0.3)' }}>
                    {strategies.map((sid, i) => (
                        <button key={sid} onClick={() => toggleStrat(sid)} style={{
                            padding: '0.15rem 0.5rem', fontSize: '0.65rem', fontWeight: 600,
                            background: selectedStrats.has(sid) ? `${LEG_COLORS[i % LEG_COLORS.length]}20` : 'transparent',
                            color: selectedStrats.has(sid) ? LEG_COLORS[i % LEG_COLORS.length] : 'var(--text-muted)',
                            border: `1px solid ${selectedStrats.has(sid) ? LEG_COLORS[i % LEG_COLORS.length] + '50' : 'var(--border)'}`,
                            borderRadius: 3, cursor: 'pointer',
                        }}>
                            {cleanName(sid)}
                        </button>
                    ))}
                </div>
            )}

            {/* Chart */}
            <div style={{ padding: '0.5rem', height: embedded ? 350 : 420 }}>
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <Mono color="var(--accent)">Loading position data...</Mono>
                    </div>
                ) : positions.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <Mono color="var(--text-muted)">No open positions to compute payoff.</Mono>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={payoffData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.4)" />
                            <XAxis
                                dataKey="price" tick={{ fill: '#94a3b8', fontSize: 10 }}
                                tickFormatter={v => v?.toFixed(0)}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                tick={{ fill: '#94a3b8', fontSize: 10 }}
                                tickFormatter={v => `₹${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
                            {spotPrice > 0 && (
                                <ReferenceLine
                                    x={Math.round(spotPrice)}
                                    stroke="#fbbf24" strokeDasharray="4 4"
                                    label={{ value: 'SPOT', position: 'top', fill: '#fbbf24', fontSize: 10 }}
                                />
                            )}
                            {breakevens.map((be, i) => (
                                <ReferenceLine
                                    key={`be-${i}`} x={be}
                                    stroke="rgba(255,255,255,0.4)" strokeDasharray="2 4"
                                    label={{ value: `BE:${be}`, position: 'top', fill: '#94a3b8', fontSize: 9 }}
                                />
                            ))}

                            {/* Combined payoff area */}
                            <Area
                                type="monotone" dataKey="combined"
                                stroke="#22d3ee" fill="rgba(34,211,238,0.06)"
                                strokeWidth={2.5} name="Combined" dot={false}
                            />

                            {/* Per-strategy lines */}
                            {strategies.filter(s => selectedStrats.has(s)).map((sid, i) => (
                                <Line
                                    key={sid} type="monotone" dataKey={`strat_${sid}`}
                                    stroke={LEG_COLORS[i % LEG_COLORS.length]}
                                    strokeWidth={1.5} name={cleanName(sid)} dot={false}
                                    strokeDasharray="4 2"
                                />
                            ))}
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
