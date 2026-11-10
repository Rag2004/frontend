/** API roots respecting Vite `base` (e.g. /pnl when the desk is hosted under a subpath). */
function baseRoot() {
  const b = (import.meta.env.BASE_URL || '/').trim();
  if (!b || b === '/') return '';
  return b.endsWith('/') ? b.slice(0, -1) : b;
}

export const DESK_ROOT = baseRoot();
export const API = `${DESK_ROOT}/api`;
export const RMS_API = `${DESK_ROOT}/rms`;
export const TOE_DHAN_API = `${DESK_ROOT}/toe-dhan`;
export const HEALTH_URL = `${DESK_ROOT}/health`;

export function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${DESK_ROOT}/ws`;
}

function appPath() {
  const path = window.location.pathname || '/';
  if (DESK_ROOT && (path === DESK_ROOT || path.startsWith(`${DESK_ROOT}/`))) {
    const rest = path.slice(DESK_ROOT.length) || '/';
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return path;
}

function redirectForAuth(status, detail) {
  const next = `${appPath()}${window.location.search || ''}`;
  if (status === 403 && detail === 'setup_auth_required') {
    window.location.assign(`${DESK_ROOT}/setup-unlock?next=${encodeURIComponent(next)}`);
    return;
  }
  if (status === 401 && detail === 'auth_required') {
    window.location.assign(`${DESK_ROOT}/login?next=${encodeURIComponent(next)}`);
  }
}

/** Same-origin fetch that sends cookies and sends the user to the right login on 401/403. */
export async function deskFetch(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (res.status === 401 || res.status === 403) {
    let detail = '';
    try {
      const body = await res.clone().json();
      detail = typeof body?.detail === 'string' ? body.detail : '';
    } catch {
      detail = '';
    }
    redirectForAuth(res.status, detail);
  }
  return res;
}
