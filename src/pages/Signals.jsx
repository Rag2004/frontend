import { useState, useEffect } from 'react';
import { toIST } from '../utils/formatIST';
import { API } from '../config/deskApi';
import { formatStrategyLabel } from '../lib/strategyDisplayNames';

export default function Signals() {
  const [signals, setSignals] = useState([]);
  const [strategyFilter, setStrategyFilter] = useState('');

  const loadSignals = () => fetch(`${API}/signals`).then(r => r.json()).then(d => setSignals(d.signals || []));
  useEffect(() => {
    loadSignals();
    const id = setInterval(loadSignals, 15000);
    return () => clearInterval(id);
  }, []);

  const match = (strategyId) =>
    !strategyFilter.trim() || (strategyId || '').toLowerCase().includes(strategyFilter.trim().toLowerCase());
  const filteredSignals = signals.filter(s => match(s.strategy_id));

  return (
    <div className="card">
      <h2>Signals (Derivatives)</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Strategy:</span>
          <input
            type="text"
            placeholder="Search by strategy..."
            value={strategyFilter}
            onChange={e => setStrategyFilter(e.target.value)}
            style={{ padding: '0.35rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: 6, minWidth: 180 }}
          />
          {strategyFilter && (
            <button type="button" onClick={() => setStrategyFilter('')} className="btn-sm">Clear</button>
          )}
        </label>
      </div>
      <table>
        <thead>
          <tr>
            <th>Signal ID</th>
            <th>Strategy</th>
            <th>Leg</th>
            <th>Symbol</th>
            <th>Strike</th>
            <th>Expiry</th>
            <th>Side</th>
            <th>Qty</th>
            <th>Approved At</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filteredSignals.map(s => {
            const ti = s.trade_intent || {};
            const meta = ti.metadata || {};
            const expiryDisplay = meta.expiry ? `${meta.expiry}${meta.option_type ? ` ${meta.option_type}` : ''}` : '-';
            return (
              <tr key={s.signal_id}>
                <td>{s.signal_id.slice(0, 8)}</td>
                <td>{formatStrategyLabel(s.strategy_id, meta.wave)}</td>
                <td>{meta.leg_role || '-'}</td>
                <td>{meta.underlying || meta.underlying_scrip || '-'}</td>
                <td>{meta.strike ?? '-'}</td>
                <td>{expiryDisplay}</td>
                <td>{ti.side}</td>
                <td>{ti.quantity}</td>
                <td>{toIST(s.approved_at)}</td>
                <td>{s.status}</td>
              </tr>
            );
          })}
          {filteredSignals.length === 0 && (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>
              {strategyFilter ? `No signals for strategy "${strategyFilter}"` : 'No signals'}
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
