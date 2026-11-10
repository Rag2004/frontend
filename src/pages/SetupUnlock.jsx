import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { API } from '../config/deskApi';

export default function SetupUnlock() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshMe } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nextPath = searchParams.get('next') || '/setup';

  async function unlock(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await fetch(`${API}/auth/setup-login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const d = data.detail;
        if (r.status === 401) setError('Sign in to the desk first.');
        else if (r.status === 503) setError('Setup password is not configured on the server.');
        else if (d === 'invalid_credentials') setError('Invalid setup password.');
        else setError(typeof d === 'string' ? d : 'Unlock failed.');
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

  return (
    <div className="login-page">
      <div className="login-panel login-panel--narrow">
        <div className="login-panel__icon" aria-hidden>
          <Lock className="h-8 w-8 text-[var(--accent)]" />
        </div>
        <h2 className="login-heading">Setup and Risk</h2>
        <p className="login-muted">Enter the setup password. This is not the desk login password.</p>
        <form className="login-form" onSubmit={unlock}>
          <label className="login-label" htmlFor="setup-password">
            Setup password
          </label>
          <div className="login-input-wrap">
            <KeyRound className="login-input-icon" aria-hidden />
            <input
              id="setup-password"
              name="password"
              type="password"
              autoComplete="current-password"
              className="login-input"
              placeholder="Setup password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
              disabled={busy}
            />
          </div>
          <button type="submit" className="login-submit" disabled={busy || !password}>
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </form>
        {error ? (
          <p className="login-error" role="alert" aria-live="polite">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
