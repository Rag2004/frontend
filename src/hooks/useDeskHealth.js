import { useState, useEffect, useCallback } from 'react';
import { API, HEALTH_URL, deskFetch } from '../config/deskApi';

/**
 * Polls risk status, root /health, and /api/connectivity for the app shell.
 */
export function useDeskHealth(pollMs = 15000) {
  const [risk, setRisk] = useState(null);
  const [health, setHealth] = useState(null);
  const [connectivity, setConnectivity] = useState(null);
  const [deskAlerts, setDeskAlerts] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [rRisk, rHealth, rConn, rDesk] = await Promise.all([
        deskFetch(`${API}/risk/status`)
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null),
        deskFetch(HEALTH_URL)
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null),
        deskFetch(`${API}/connectivity`)
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => ({ backend: 'error' })),
        deskFetch(`${API}/desk/alerts`)
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null),
      ]);
      setRisk(rRisk);
      setHealth(rHealth);
      setConnectivity(rConn);
      setDeskAlerts(rDesk);
      setLastUpdated(new Date());
      setFetchError(null);
    } catch (e) {
      setFetchError(e?.message || 'health fetch failed');
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { risk, health, connectivity, deskAlerts, lastUpdated, fetchError, refresh };
}
