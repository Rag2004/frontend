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

export default function MTMChart({
    embedded = false,
    strategyFilter = null,
    date: dateProp = null,
}) {
    const [chartData, setChartData] = useState([]);
    const [strategies, setStrategies] = useState([]);
    const [underlyingKeys, setUnderlyingKeys] = useState([]);
    const [underlyingNames, setUnderlyingNames] = useState({});
    const [selectedStrats, setSelectedStrats] = useState(new Set());
    const [date, setDate] = useState(() => dateProp || new Date().toISOString().slice(0, 10));
    const [loading, setLoading] = useState(true);
    const [count, setCount] = useState(0);
    const [indexFilter, setIndexFilter] = useState(INDEX_FILTERS.ALL);
    const [strategyUnderlyingById, setStrategyUnderlyingById] = useState({});
    const dateControlled = dateProp != null;

    useEffect(() => {
        if (dateControlled) setDate(dateProp);
    }, [dateControlled, dateProp]);

    const STRAT_COLORS = ['#22d3ee', '#34d399', '#f87171', '#fbbf24', '#a78bfa', '#fb923c', '#e879f9'];

    const loadChart = useCallback(() => {
        fetch(`${API}/mtm-chart?date=${date}`)
            .then(r => r.json())
            .then(d => {
                const points = d.points || [];
                // Collect all strategy names
                const stratSet = new Set();
                const ulNames = d.underlying_names || {};
                const ulKeySet = new Set();
                const formatted = points.map(p => {
                    const ts = new Date(p.ts);
                    const timeStr = ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
                    const row = {
                        time: timeStr,
                        ts: ts.getTime(),
                        total_mtm: p.total_mtm,
                        realized: p.realized,
                        unrealized: p.unrealized,
                    };
                    const prices = p.underlying_prices || {};
                    for (const [scrip, price] of Object.entries(prices)) {
                        row[`spot_${scrip}`] = price;
                        ulKeySet.add(scrip);
                    }
                    for (const [sid, mtm] of Object.entries(p.strategies || {})) {
                        row[`strat_${sid}`] = mtm;
                        stratSet.add(sid);
                    }
                    return row;
                });
                setChartData(formatted);
                const stratArr = Array.from(stratSet);
                setStrategies(stratArr);
                setUnderlyingKeys(Array.from(ulKeySet));
                setUnderlyingNames(ulNames);
                if (strategyFilter) {
                    setSelectedStrats(new Set([strategyFilter]));
                } else if (selectedStrats.size === 0 && stratArr.length > 0) {
                    setSelectedStrats(new Set(stratArr));
                }
                setCount(d.count || 0);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [date, strategyFilter]);

    useEffect(() => { loadChart(); }, [loadChart]);
    // Auto-refresh every 10s during market hours
    useEffect(() => {
        const id = setInterval(loadChart, 10000);
        return () => clearInterval(id);
    }, [loadChart]);
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

    const visibleStrategies = useMemo(
        () => strategies.filter((sid) => strategyMatchesIndex(sid, indexFilter, strategyUnderlyingById)),
        [strategies, indexFilter, strategyUnderlyingById]
    );

    const visibleUnderlyingKeys = useMemo(() => {
        if (indexFilter === INDEX_FILTERS.NIFTY) return underlyingKeys.filter((k) => Number(k) === NIFTY_SCRIP);
        if (indexFilter === INDEX_FILTERS.SENSEX) return underlyingKeys.filter((k) => Number(k) === SENSEX_SCRIP);
        return underlyingKeys;
    }, [underlyingKeys, indexFilter]);

    const filteredChartData = useMemo(() => {
        if (indexFilter === INDEX_FILTERS.ALL) return chartData;
        return chartData.map((row) => {
            let total = 0;
            for (const sid of visibleStrategies) total += Number(row[`strat_${sid}`] || 0);
            return { ...row, filtered_total_mtm: total };
        });
    }, [chartData, indexFilter, visibleStrategies]);

    useEffect(() => {
        if (strategyFilter) {
            setSelectedStrats(new Set([strategyFilter]));
            return;
        }
        setSelectedStrats(new Set(visibleStrategies));
    }, [strategyFilter, visibleStrategies]);

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
                <div style={{ marginBottom: '0.4rem', fontWeight: 600 }}><Mono size="0.75rem">{label} IST</Mono></div>
                {payload.map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                        <span style={{ color: p.color, fontSize: '0.7rem' }}>{p.name}</span>
                        <Mono color={p.color} size="0.7rem">
                            {p.dataKey?.startsWith('spot_') ? p.value?.toFixed(2) : `₹${p.value?.toFixed(0)}`}
                        </Mono>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div style={{ background: embedded ? 'transparent' : 'var(--bg-card)', border: embedded ? 'none' : '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
                padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.3)',
                borderBottom: '1px solid var(--border)', gap: '0.5rem',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.06em' }}>
                        ◉ MTM vs UNDERLYING
                    </span>
                    <Mono color="var(--text-muted)" size="0.65rem">
                        {count} data points
                    </Mono>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                    {!dateControlled && (
                        <input type="date" value={date} onChange={e => setDate(e.target.value)}
                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)' }}
                        />
                    )}
                </div>
            </div>

            {/* Strategy filter chips */}
            {!strategyFilter && visibleStrategies.length > 0 && (
                <div style={{ padding: '0.4rem 0.75rem', display: 'flex', gap: '0.3rem', flexWrap: 'wrap', borderBottom: '1px solid rgba(51,65,85,0.3)' }}>
                    {visibleStrategies.map((sid, i) => (
                        <button key={sid} onClick={() => toggleStrat(sid)} style={{
                            padding: '0.15rem 0.5rem', fontSize: '0.65rem', fontWeight: 600,
                            background: selectedStrats.has(sid) ? `${STRAT_COLORS[i % STRAT_COLORS.length]}20` : 'transparent',
                            color: selectedStrats.has(sid) ? STRAT_COLORS[i % STRAT_COLORS.length] : 'var(--text-muted)',
                            border: `1px solid ${selectedStrats.has(sid) ? STRAT_COLORS[i % STRAT_COLORS.length] + '50' : 'var(--border)'}`,
                            borderRadius: 3, cursor: 'pointer', transition: 'all 0.15s',
                        }}>
                            {cleanName(sid)}
                        </button>
                    ))}
                </div>
            )}

            {/* Chart */}
            <div style={{ padding: '0.5rem', height: embedded ? 350 : 420 }}>
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                        <Mono color="var(--accent)">Loading MTM data...</Mono>
                    </div>
                ) : filteredChartData.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                        <Mono color="var(--text-muted)">No MTM data for {date}. PnL snapshots generate during market hours.</Mono>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={filteredChartData} margin={{ top: 5, right: 50, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.4)" />
                            <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" />
                            <YAxis
                                yAxisId="mtm"
                                tick={{ fill: '#22d3ee', fontSize: 10 }}
                                tickFormatter={v => `₹${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`}
                                label={{ value: 'MTM (₹)', angle: -90, position: 'insideLeft', fill: '#22d3ee', fontSize: 11 }}
                            />
                            <YAxis
                                yAxisId="spot"
                                orientation="right"
                                tick={{ fill: '#fbbf24', fontSize: 10 }}
                                tickFormatter={v => v?.toFixed(0)}
                                label={{ value: 'Spot', angle: 90, position: 'insideRight', fill: '#fbbf24', fontSize: 11 }}
                                domain={['auto', 'auto']}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <ReferenceLine yAxisId="mtm" y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />

                            {/* Total or selected strategy MTM area */}
                            <Area
                                yAxisId="mtm"
                                type="monotone"
                                dataKey={strategyFilter ? `strat_${strategyFilter}` : (indexFilter === INDEX_FILTERS.ALL ? 'total_mtm' : 'filtered_total_mtm')}
                                stroke="#22d3ee" fill="rgba(34,211,238,0.08)"
                                strokeWidth={2} name={strategyFilter ? `${cleanName(strategyFilter)} MTM` : 'Total MTM'} dot={false}
                            />

                            {/* Per-strategy lines */}
                            {visibleStrategies.filter(s => selectedStrats.has(s)).map((sid, i) => (
                                <Line
                                    key={sid} yAxisId="mtm" type="monotone"
                                    dataKey={`strat_${sid}`} stroke={STRAT_COLORS[i % STRAT_COLORS.length]}
                                    strokeWidth={1.5} name={cleanName(sid)} dot={false}
                                    strokeDasharray="4 2"
                                />
                            ))}

                            {/* Underlying spot prices */}
                            {visibleUnderlyingKeys.map((scrip, i) => (
                                <Line
                                    key={`spot_${scrip}`}
                                    yAxisId="spot" type="monotone" dataKey={`spot_${scrip}`}
                                    stroke={i === 0 ? '#fbbf24' : '#fb923c'}
                                    strokeWidth={2} name={underlyingNames[scrip] || `Spot ${scrip}`}
                                    dot={false}
                                />
                            ))}
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
