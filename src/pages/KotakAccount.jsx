import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { API, deskFetch } from '../config/deskApi';

const EMPTY = {
  access_token: '',
  client_id: '',
  mobile: '',
  mpin: '',
  totp_secret: '',
};

export default function KotakAccount() {
  const [form, setForm] = useState(EMPTY);
  const [totp, setTotp] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await deskFetch(`${API}/broker/kotak/status`).catch(() => null);
    if (!response || !response.ok) {
      setStatus(null);
      return;
    }
    setStatus(await response.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (name) => (event) => {
    setForm((current) => ({ ...current, [name]: event.target.value }));
  };

  const canSave = useMemo(() => {
    return (
      form.access_token.trim() &&
      form.client_id.trim() &&
      form.mobile.trim() &&
      form.mpin.trim() &&
      form.totp_secret.trim()
    );
  }, [form]);

  const post = useCallback(
    async (path, payload) => {
      setBusy(true);
      setError('');
      setMessage('');
      try {
        const response = await deskFetch(`${API}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const text = await response.text().catch(() => '');
        const body = (() => {
          try {
            return text ? JSON.parse(text) : {};
          } catch {
            return {};
          }
        })();
        if (!response.ok) {
          setError(String(body?.detail || text.slice(0, 300) || `Failed: ${response.status}`));
          return;
        }
        return body;
      } catch (err) {
        setError(err?.message || 'network error');
      } finally {
        setBusy(false);
        load();
      }
    },
    [load]
  );

  const save = useCallback(async () => {
    const saved = await post('/broker/kotak/credentials', {
      access_token: form.access_token.trim(),
      client_id: form.client_id.trim(),
      mobile: form.mobile.trim(),
      mpin: form.mpin.trim(),
      totp_secret: form.totp_secret.trim(),
    });
    if (saved) {
      setForm(EMPTY);
      setMessage('Credentials saved to broker:kotak:prod. Click Generate session next.');
    }
  }, [form, post]);

  const testLogin = useCallback(async () => {
    const result = await post('/broker/kotak/test-login', { totp });
    if (result?.ok) {
      setTotp('');
      setMessage('Neo accepted TOTP + MPIN (test only — session was not kept). Use Generate session to trade.');
    }
  }, [post, totp]);

  const generateSession = useCallback(async () => {
    const result = await post('/broker/kotak/generate-session', { totp: totp || '' });
    if (result?.has_session) {
      setTotp('');
      setMessage('Live trade session saved. Recreate toe_kotak so it picks up trade_token/trade_sid.');
    }
  }, [post, totp]);

  const ready = Boolean(status?.has_credentials);
  const sessionReady = Boolean(status?.has_session);

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {sessionReady ? <ShieldCheck className="h-5 w-5" aria-hidden /> : <ShieldAlert className="h-5 w-5" aria-hidden />}
        Kotak Neo (live) — credentials + session
      </h2>
      <div className="subtitle">
        Live TOE reads <code className="timestamp">broker:kotak:prod</code>. Save credentials first, then{' '}
        <strong>Generate session</strong> (uses typed 6-digit TOTP, or the saved TOTP secret if the field is empty).
        That writes <code className="timestamp">trade_token</code> / <code className="timestamp">trade_sid</code> Neo
        needs for orders. Desk login alone is not enough — unlock Setup before Save / Generate.
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.85rem 0' }}>
        <span
          className="badge"
          style={{
            background: ready ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
            color: ready ? 'var(--positive)' : 'var(--negative)',
          }}
        >
          {ready ? `Credentials ${status?.client_id || ''}` : 'Credentials missing'}
        </span>
        <span
          className="badge"
          style={{
            background: sessionReady ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
            color: sessionReady ? 'var(--positive)' : 'var(--negative)',
          }}
        >
          {sessionReady ? 'Session active' : 'Session missing'}
        </span>
        <span className="timestamp">{status?.session_at || status?.updated_at || ''}</span>
        <button className="btn-sm" onClick={() => load()} disabled={busy} style={{ marginLeft: 'auto' }}>
          <RefreshCw className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          Refresh status
        </button>
      </div>

      {status?.last_error && (
        <div
          style={{
            padding: '0.45rem 0.65rem',
            border: '1px solid rgba(248,113,113,0.35)',
            background: 'rgba(248,113,113,0.08)',
            borderRadius: 6,
            marginBottom: '0.85rem',
            fontFamily: 'var(--mono)',
            color: 'var(--negative)',
            fontSize: '0.78rem',
          }}
        >
          Last session error: {status.last_error}
        </div>
      )}
      {error && (
        <div
          style={{
            padding: '0.45rem 0.65rem',
            border: '1px solid rgba(248,113,113,0.35)',
            background: 'rgba(248,113,113,0.08)',
            borderRadius: 6,
            marginBottom: '0.85rem',
            fontFamily: 'var(--mono)',
            color: 'var(--negative)',
            fontSize: '0.78rem',
          }}
        >
          {error}
        </div>
      )}
      {message && (
        <div className="timestamp" style={{ marginBottom: '0.85rem' }}>
          {message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1rem' }}>
        <label>
          <div className="timestamp">Dashboard access token</div>
          <input value={form.access_token} onChange={setField('access_token')} type="password" autoComplete="off" />
        </label>
        <label>
          <div className="timestamp">Client code (UCC)</div>
          <input value={form.client_id} onChange={setField('client_id')} autoComplete="off" />
        </label>
        <label>
          <div className="timestamp">Mobile number</div>
          <input value={form.mobile} onChange={setField('mobile')} autoComplete="off" />
        </label>
        <label>
          <div className="timestamp">MPIN</div>
          <input value={form.mpin} onChange={setField('mpin')} type="password" autoComplete="off" />
        </label>
        <label>
          <div className="timestamp">TOTP secret</div>
          <input value={form.totp_secret} onChange={setField('totp_secret')} type="password" autoComplete="off" />
        </label>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn-sm" onClick={save} disabled={busy || !canSave}>
            <KeyRound className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            Save credentials
          </button>
        </div>
        <label>
          <div className="timestamp">TOTP (6 digits — optional if secret saved)</div>
          <input
            value={totp}
            onChange={(event) => setTotp(event.target.value.replace(/[^\d]/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="off"
          />
        </label>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn-sm" onClick={generateSession} disabled={busy || !ready}>
            Generate session
          </button>
          <button className="btn-sm" onClick={testLogin} disabled={busy || !/^\d{6}$/.test(totp)}>
            Test login (no save)
          </button>
        </div>
      </div>
    </div>
  );
}
