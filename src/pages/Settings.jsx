import { useState, useEffect, useCallback } from 'react';
import { API } from '../config/deskApi';
import { getStrategyDisplayName } from '../lib/strategyDisplayNames';
import { ENTRY_TIMES, EXIT_TIMES } from '../lib/strategyMetadata';

export default function Settings() {
  const [configs, setConfigs] = useState([]);
  const [symbols, setSymbols] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [editing, setEditing] = useState(null); // strategy_id being edited
  const [form, setForm] = useState({ underlying_scrip: 13, segment: 'IDX_I', expiry: '' });
  const [saving, setSaving] = useState(false);

  const [loadError, setLoadError] = useState(null);

  const load = useCallback(() => {
    setLoadError(null);
    fetch(`${API}/strategy-configs`)
      .then(r => r.json())
      .then(d => setConfigs(d.configs || []))
      .catch(() => setConfigs([]));
    fetch(`${API}/symbols`)
      .then(r => r.json())
      .then(d => setSymbols(d.symbols || []))
      .catch(() => setSymbols([]));
    fetch(`${API}/strategies`)
      .then(r => {
        if (!r.ok) throw new Error('Backend not reachable');
        return r.json();
      })
      .then(d => setStrategies(d.strategies || []))
      .catch((e) => {
        setStrategies([]);
        setLoadError('Could not load strategies. Is the backend running? Start it with: python run.py (port 8000)');
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  const getConfigFor = (sid) => configs.find(c => c.strategy_id === sid) || {};

  const symbolName = (scrip) => {
    const s = symbols.find(x => x.security_id === scrip);
    return s ? (s.display_name || s.symbol_name) : scrip;
  };

  const handleToggle = async (strategyId, current) => {
    await fetch(`${API}/strategy-configs/${strategyId}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !current }),
    });
    load();
  };

  const openEdit = (strategyId) => {
    const cfg = getConfigFor(strategyId);
    const scrip = cfg.underlying_scrip;
    const validScrip = (symbols.some(s => s.security_id === scrip) ? scrip : null) || (symbols[0]?.security_id ?? 13);
    setForm({
      underlying_scrip: validScrip,
      segment: cfg.segment || 'IDX_I',
      expiry: cfg.expiry || '',
    });
    setEditing(strategyId);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setLoadError(null);
    const res = await fetch(`${API}/strategy-configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy_id: editing,
        enabled: getConfigFor(editing).enabled ?? false,
        underlying_scrip: form.underlying_scrip,
        segment: form.segment,
        expiry: form.expiry || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setLoadError(data.detail || data.error || 'Save failed');
      return;
    }
    setEditing(null);
    load();
  };

  return (
    <div className="card">
      <h2>Strategy Configuration</h2>
      <p className="subtitle" style={{ marginBottom: '0.5rem' }}>
        Strategies are coded on the backend. To start: <strong>Edit</strong> → choose <strong>Symbol</strong> → <strong>Save</strong> → turn <strong>Algo Status ON</strong>.
      </p>
      <p className="subtitle" style={{ marginBottom: '1rem', fontSize: '0.8rem' }}>
        If a symbol fails (Invalid SecurityId), use <strong>NIFTY 50</strong> or <strong>BANK NIFTY</strong>. No trades until market data is fetched.
      </p>
      {loadError && (
        <div style={{ padding: '0.75rem', background: 'rgba(248,113,113,0.15)', color: 'var(--negative)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 6, marginBottom: '1rem', fontSize: '0.9rem' }}>
          {loadError}
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Sr.</th>
            <th>Strategy</th>
            <th>Entry time (IST)</th>
            <th>Exit time (IST)</th>
            <th>Symbol</th>
            <th>Segment</th>
            <th>Expiry</th>
            <th>Algo Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {strategies.map((sid, idx) => {
            const cfg = getConfigFor(sid);
            const enabled = cfg.enabled || false;
            return (
              <tr key={sid}>
                <td>{idx + 1}</td>
                <td style={{ fontWeight: 600 }}>{getStrategyDisplayName(sid)}</td>
                <td>{ENTRY_TIMES[sid] || '—'}</td>
                <td>{EXIT_TIMES[sid] || '—'}</td>
                <td>
                  {cfg.underlying_scrip ? symbolName(cfg.underlying_scrip) : '—'}
                  {cfg.invalid_symbol && <span style={{ color: 'var(--negative)', fontSize: '0.75rem', marginLeft: 6 }}>(invalid — re-select)</span>}
                </td>
                <td>{cfg.segment || '—'}</td>
                <td>{cfg.expiry || '—'}</td>
                <td>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => handleToggle(sid, enabled)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                  <span style={{ marginLeft: 8, fontSize: '0.8rem', color: enabled ? 'var(--positive)' : 'var(--text-muted)' }}>
                    {enabled ? 'ON' : 'OFF'}
                  </span>
                </td>
                <td>
                  <button className="btn-sm" onClick={() => openEdit(sid)}>Edit</button>
                </td>
              </tr>
            );
          })}
          {strategies.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No strategies registered</td></tr>
          )}
        </tbody>
      </table>

      {/* Edit Modal */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3>Edit — {getStrategyDisplayName(editing)}</h3>
            <form onSubmit={handleSave}>
              <div className="form-grid">
                <label>Symbol</label>
                <select
                  value={form.underlying_scrip}
                  onChange={e => {
                    const v = Number(e.target.value);
                    const s = symbols.find(x => x.security_id === v) || {};
                    setForm(prev => ({ ...prev, underlying_scrip: v, segment: s.segment || 'IDX_I' }));
                  }}
                >
                  {symbols.map(s => (
                    <option key={s.security_id} value={s.security_id}>
                      {s.display_name || s.symbol_name}
                    </option>
                  ))}
                </select>
                <label>Segment</label>
                <input readOnly value={form.segment} style={{ background: 'rgba(0,0,0,0.2)', opacity: 0.9 }} />
                <label>Expiry</label>
                <input
                  type="date"
                  value={form.expiry || ''}
                  onChange={e => setForm(prev => ({ ...prev, expiry: e.target.value }))}
                />
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                <button type="button" className="btn-cancel" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
