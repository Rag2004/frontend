import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, ShieldAlert, RefreshCw, KeyRound, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { API } from '../config/deskApi';

function fmtIST(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return String(iso);
  }
}

function statusBadge(s) {
  const mins = typeof s?.minutes_left === 'number' ? s.minutes_left : null;
  const hasToken = Boolean(s?.has_token);
  // Expired (mins <= 0) is bad — RenewToken cannot revive it.
  const ok = hasToken && mins != null && mins > 10;
  const warn = hasToken && mins != null && mins > 0 && mins <= 10;
  const bad = !ok && !warn;
  return { ok, warn, bad, mins };
}

function Panel({ title, env, data, onRefresh, onRenew, busy, canRefresh, refreshHint, showRefreshButton }) {
  const { ok, warn, bad, mins } = statusBadge(data);
  const tone = ok ? 'rgba(52,211,153,0.12)' : warn ? 'rgba(251,191,36,0.12)' : 'rgba(248,113,113,0.12)';
  const Icon = ok ? ShieldCheck : ShieldAlert;
  const statusText = ok
    ? `Valid (${mins}m left)`
    : warn
      ? `Expiring (${mins}m left)`
      : mins != null && mins <= 0
        ? `Expired (${mins}m)`
        : data?.last_error
          ? 'Error'
          : 'Missing';

  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Icon className="h-4 w-4" aria-hidden />
          <div>
            <div style={{ fontWeight: 700, letterSpacing: '0.02em' }}>{title}</div>
            <div className="timestamp">env={env}</div>
          </div>
        </div>
        <span
          className="badge"
          style={{
            background: tone,
            border: '1px solid var(--border)',
            color: ok ? 'var(--positive)' : warn ? 'var(--warning)' : 'var(--negative)',
          }}
        >
          {statusText}
        </span>
      </div>

      <div style={{ marginTop: '0.9rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem 1rem' }}>
        <div>
          <div className="timestamp">Client ID</div>
          <div style={{ fontFamily: 'var(--mono)' }}>{data?.client_id || '—'}</div>
        </div>
        <div>
          <div className="timestamp">Expires (IST)</div>
          <div style={{ fontFamily: 'var(--mono)' }}>{fmtIST(data?.expiry_time)}</div>
        </div>
        <div>
          <div className="timestamp">Last refreshed</div>
          <div style={{ fontFamily: 'var(--mono)' }}>{fmtIST(data?.last_refreshed_at)}</div>
        </div>
        <div>
          <div className="timestamp">Last error</div>
          <div style={{ fontFamily: 'var(--mono)', color: data?.last_error ? 'var(--negative)' : 'var(--text-muted)' }}>
            {data?.last_error || '—'}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '0.9rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {showRefreshButton ? (
          <button className="btn-sm" onClick={onRefresh} disabled={busy || !canRefresh} title={refreshHint || ''}>
            <RefreshCw className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            Refresh token (server TOTP)
          </button>
        ) : null}
        <button
          className="btn-sm"
          onClick={onRenew}
          disabled={busy || bad || (mins != null && mins <= 0)}
          title={
            mins != null && mins <= 0
              ? 'Token expired — use Generate token (PIN + TOTP) on the left'
              : 'Renew active token (fails if expired)'
          }
        >
          Renew token
        </button>
      </div>
    </div>
  );
}

export default function DhanAccount() {
  const [live, setLive] = useState(null);
  const [caps, setCaps] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clientId, setClientId] = useState('');
  const [pin, setPin] = useState('');
  const [totp, setTotp] = useState('');
  const [showPin, setShowPin] = useState(false);

  const load = useCallback(async () => {
    setError('');
    const [sLive, c] = await Promise.all([
      fetch(`${API}/broker/dhan/status?env=live`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${API}/broker/dhan/capabilities`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    setLive(sLive);
    setCaps(c);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  // Prefill Client ID from stored live status so Generate is one less field to hunt for.
  useEffect(() => {
    if (!clientId && live?.client_id) setClientId(String(live.client_id));
  }, [live, clientId]);

  const action = useCallback(
    async (env, op) => {
      setBusy(true);
      setError('');
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 12000);
        const r = await fetch(`${API}/broker/dhan/${op}?env=${env}`, { method: 'POST', signal: ac.signal });
        clearTimeout(t);
        const text = await r.text().catch(() => '');
        const d = (() => {
          try {
            return text ? JSON.parse(text) : {};
          } catch {
            return {};
          }
        })();
        if (!r.ok) {
          setError(String(d?.detail || d?.error || (text ? text.slice(0, 300) : '') || `Failed: ${r.status}`));
          return;
        }
      } catch (e) {
        if (e?.name === 'AbortError') setError('Request timed out (backend offline or slow).');
        else setError(e?.message || 'network error');
      } finally {
        setBusy(false);
        load();
      }
    },
    [load]
  );

  const refreshLiveWithInput = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const payload = {
        dhanClientId: String(clientId || '').trim(),
        pin: String(pin || '').trim(),
        totp: String(totp || '').trim(),
      };
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 12000);
      const r = await fetch(`${API}/broker/dhan/live/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
      clearTimeout(t);
      const text = await r.text().catch(() => '');
      const d = (() => {
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          return {};
        }
      })();
      if (!r.ok) {
        setError(String(d?.detail || d?.error || (text ? text.slice(0, 300) : '') || `Failed: ${r.status}`));
        return;
      }
      // Clear transient secrets after success.
      setPin('');
      setTotp('');
    } catch (e) {
      if (e?.name === 'AbortError') setError('Request timed out (backend offline or slow).');
      else setError(e?.message || 'network error');
    } finally {
      setBusy(false);
      load();
    }
  }, [clientId, pin, totp, load]);

  const headline = useMemo(() => {
    const l = statusBadge(live);
    const okN = [l.ok].filter(Boolean).length;
    const warnN = [l.warn].filter(Boolean).length;
    const badN = [l.bad].filter(Boolean).length;
    return { okN, warnN, badN };
  }, [live]);

  const canSubmit = useMemo(() => {
    const cid = String(clientId || '').trim();
    const p = String(pin || '').trim();
    const t = String(totp || '').trim();
    return cid.length >= 6 && p.length >= 4 && /^\d{6}$/.test(t);
  }, [clientId, pin, totp]);

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <ShieldCheck className="h-5 w-5" aria-hidden />
        Dhan Account (Live) — Auth & Token
      </h2>
      <div className="subtitle">
        <strong>Generate token</strong> — new 24h JWT using PIN + authenticator code (left panel).{' '}
        <strong>Renew token</strong> — extend an <em>already valid</em> JWT via Dhan RenewToken (right panel).{' '}
        <strong>Refresh token</strong> (right panel) — only if the server has DHAN_LIVE_* TOTP secrets in <code className="timestamp">.env</code>; otherwise use Generate.
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
        <span className="badge" style={{ background: 'rgba(52,211,153,0.12)', color: 'var(--positive)' }}>
          OK {headline.okN}
        </span>
        <span className="badge" style={{ background: 'rgba(251,191,36,0.12)', color: 'var(--warning)' }}>
          Expiring {headline.warnN}
        </span>
        <span className="badge" style={{ background: 'rgba(248,113,113,0.12)', color: 'var(--negative)' }}>
          Missing/Error {headline.badN}
        </span>
        <button className="btn-sm" onClick={() => load()} disabled={busy} style={{ marginLeft: 'auto' }}>
          <RefreshCw className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          Refresh status
        </button>
      </div>

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

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '1rem' }}>
        <div className="card" style={{ padding: '1.25rem', marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <LockKeyhole className="h-4 w-4" aria-hidden />
              <div>
                <div style={{ fontWeight: 700, letterSpacing: '0.02em' }}>Generate access token (Live)</div>
                <div className="timestamp">PIN + TOTP are not stored; token is stored in Mongo for services.</div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '0.9rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem 1rem' }}>
            <div>
              <div className="timestamp">Dhan Client ID</div>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <KeyRound className="h-4 w-4 opacity-80" aria-hidden />
                <input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="e.g. 1100000000"
                  autoComplete="off"
                />
              </div>
            </div>
            <div>
              <div className="timestamp">PIN</div>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••••"
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  autoComplete="off"
                />
                <button type="button" className="btn-sm" onClick={() => setShowPin((v) => !v)} title="Show/hide PIN">
                  {showPin ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </div>
            <div>
              <div className="timestamp">TOTP (6 digits)</div>
              <input
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn-sm" onClick={refreshLiveWithInput} disabled={busy || !canSubmit} title="Generate token for 24h">
                <RefreshCw className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                Generate token
              </button>
              <span className="timestamp">Use authenticator app code; refresh if expired.</span>
            </div>
          </div>
        </div>

        <Panel
          title="Live status (api.dhan.co)"
          env="live"
          data={live}
          busy={busy}
          showRefreshButton={Boolean(caps?.server_totp_refresh_live)}
          canRefresh={Boolean(caps?.server_totp_refresh_live)}
          refreshHint={
            caps?.server_totp_refresh_live
              ? 'Server-side TOTP: refresh without typing PIN (uses .env secrets).'
              : 'Configure DHAN_LIVE_CLIENT_ID, PIN, TOTP_SECRET in server .env or use Generate token.'
          }
          onRefresh={() => action('live', 'refresh')}
          onRenew={() => action('live', 'renew')}
        />
      </div>

      <div className="timestamp" style={{ marginTop: '0.85rem' }}>
        Live-only mode. Execution services read the token from Mongo (`broker_tokens`) and fall back to `.env` if needed.
      </div>
    </div>
  );
}

