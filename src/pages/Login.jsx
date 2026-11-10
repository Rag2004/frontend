import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { API } from '../config/deskApi';

const envBadge = import.meta.env.VITE_DESK_ENV || import.meta.env.MODE || 'dev';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshMe, authRequired, ready, user } = useAuth();

  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const nextPath = searchParams.get('next') || '/pnl';

  useEffect(() => {
    if (!ready) return;
    if (!authRequired) {
      navigate(nextPath, { replace: true });
      return;
    }
    if (user) {
      navigate(nextPath, { replace: true });
    }
  }, [ready, authRequired, user, navigate, nextPath]);

  async function signIn(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await fetch(`${API}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const d = data.detail;
        if (r.status === 503 && d === 'desk_auth_misconfigured') {
          setError('Desk login is not configured on the server (missing password).');
        } else if (typeof d === 'string') {
          if (d === 'invalid_credentials') setError('Invalid username or password.');
          else setError(d);
        } else {
          setError('Sign-in failed.');
        }
        return;
      }
      await refreshMe();
      navigate(nextPath, { replace: true });
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !authRequired || user) {
    return (
      <div className="login-page">
        <div className="login-panel login-panel--narrow">
          <p className="login-muted">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-split">
        <aside className="login-brand" aria-hidden="false">
          <div className="login-brand__mark">QE</div>
          <h1 className="login-brand__title">Quant Engine</h1>
          <p className="login-brand__sub">Options desk · secure sign-in</p>
          <span className="login-env">{String(envBadge)}</span>
        </aside>
        <div className="login-panel">
          <div className="login-panel__icon" aria-hidden>
            <Lock className="h-8 w-8 text-[var(--accent)]" />
          </div>
          <h2 className="login-heading">Sign in</h2>
          <p className="login-muted">Desk admin account. Setup and Risk uses a different password.</p>

          <form className="login-form" onSubmit={signIn}>
            <label className="login-label" htmlFor="login-password">
              Password
            </label>
            <div className="login-input-wrap">
              <KeyRound className="login-input-icon" aria-hidden />
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                className="login-input"
                placeholder="Desk password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                required
                disabled={busy}
              />
            </div>
            <button type="submit" className="login-submit" disabled={busy || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {error ? (
            <p className="login-error" role="alert" aria-live="polite">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
