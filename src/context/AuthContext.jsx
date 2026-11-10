import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { API } from '../config/deskApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [setupAuthRequired, setSetupAuthRequired] = useState(false);
  const [user, setUser] = useState(null);
  const [setupAuthenticated, setSetupAuthenticated] = useState(false);

  const refreshMe = useCallback(async () => {
    const s = await fetch(`${API}/auth/status`, { credentials: 'include' });
    if (!s.ok) {
      setAuthRequired(false);
      setSetupAuthRequired(false);
      setUser(null);
      setSetupAuthenticated(false);
      setReady(true);
      return;
    }
    const sj = await s.json();
    const required = Boolean(sj.auth_required);
    const setupRequired = Boolean(sj.setup_auth_required);
    setAuthRequired(required);
    setSetupAuthRequired(setupRequired);
    if (!required) {
      setUser(null);
      setSetupAuthenticated(false);
      setReady(true);
      return;
    }
    const m = await fetch(`${API}/auth/me`, { credentials: 'include' });
    if (!m.ok) {
      setUser(null);
      setSetupAuthenticated(false);
      setReady(true);
      return;
    }
    const mj = await m.json();
    const who = mj.user || mj.email;
    if (mj.authenticated && who) {
      setUser(who);
    } else {
      setUser(null);
      setSetupAuthenticated(false);
      setReady(true);
      return;
    }
    const setup = await fetch(`${API}/auth/setup-me`, { credentials: 'include' });
    if (!setup.ok) {
      setSetupAuthenticated(false);
    } else {
      const body = await setup.json();
      setSetupAuthenticated(Boolean(body.setup_authenticated));
    }
    setReady(true);
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      /* ignore */
    }
    setUser(null);
    setSetupAuthenticated(false);
    await refreshMe();
  }, [refreshMe]);

  const value = useMemo(
    () => ({
      ready,
      authRequired,
      setupAuthRequired,
      user,
      setupAuthenticated,
      refreshMe,
      logout,
      isAuthenticated: !authRequired || Boolean(user),
      isSetupAuthenticated: !setupAuthRequired || setupAuthenticated,
    }),
    [ready, authRequired, setupAuthRequired, user, setupAuthenticated, refreshMe, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
