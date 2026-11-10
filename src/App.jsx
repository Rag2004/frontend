import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Settings, Activity, LayoutGrid, IndianRupee, SlidersHorizontal, KeyRound, PlusCircle, CalendarDays, LogOut, PieChart } from 'lucide-react';
import SetupAndRisk from './pages/SetupAndRisk';
import ManualTrade from './pages/ManualTrade';
import Orders from './pages/Orders';
import PnL from './pages/PnL';
import Analytics from './pages/Analytics';
import Portfolio from './pages/Portfolio';
import Signals from './pages/Signals';
import BrokerReconciliation from './pages/BrokerReconciliation';
import DhanAccount from './pages/DhanAccount';
import KotakAccount from './pages/KotakAccount';
import Login from './pages/Login';
import SetupUnlock from './pages/SetupUnlock';
import { isBrokerReconciliationDesk } from './config/deskProfile';
import { DeskShellProvider, useDeskShell } from './context/DeskShellContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { GlobalAlertStrip } from './components/GlobalAlertStrip';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { NotificationBell } from './components/NotificationBell';

function formatISTClock(d) {
  try {
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
    return '';
  }
}

function formatSyncTime(d) {
  if (!d) return '—';
  try {
    return d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

const envBadge = import.meta.env.VITE_DESK_ENV || import.meta.env.MODE || 'dev';

/** React Router: leading slash, no trailing slash (Vite BASE_URL ends with /). */
function routerBasename() {
  const b = import.meta.env.BASE_URL || '/';
  if (b === '/') return undefined;
  return b.endsWith('/') ? b.slice(0, -1) : b;
}

function AppShell() {
  const { connected, reconnecting, lastEventAt, connectivity, deskAlerts, lastUpdated, refresh, pipelineOk, rmsOk, toeOk, redisOk, strategyWorkerStatus, strategyWorkerOk, risk, health } =
    useDeskShell();
  const { authRequired, user, logout } = useAuth();
  const navigate = useNavigate();
  const [clock, setClock] = useState(() => new Date());
  const showBrokerReconciliation = isBrokerReconciliationDesk();

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="app">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">
            QE
          </div>
          <div className="brand-text">
            <span className="brand-title">Quant Engine</span>
            <span className="brand-sub">Options · Strategy desk</span>
          </div>
        </div>
        <nav className="nav-main">
          <NavLink to="/setup" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon" aria-hidden="true">
              <Settings size={16} strokeWidth={2} />
            </span>
            Setup &amp; Risk
          </NavLink>
          <NavLink to="/manual-trade" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon" aria-hidden="true">
              <PlusCircle size={16} strokeWidth={2} />
            </span>
            Manual Trade
          </NavLink>
          <NavLink to="/dhan" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon" aria-hidden="true">
              <KeyRound size={16} strokeWidth={2} />
            </span>
            Dhan
          </NavLink>
          <NavLink to="/kotak" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon" aria-hidden="true">
              <KeyRound size={16} strokeWidth={2} />
            </span>
            Kotak
          </NavLink>
          <NavLink to="/signals" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon" aria-hidden="true">
              <Activity size={16} strokeWidth={2} />
            </span>
            Signals
          </NavLink>
          <NavLink to="/orders" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon" aria-hidden="true">
              <LayoutGrid size={16} strokeWidth={2} />
            </span>
            Orders
          </NavLink>
          <NavLink to="/pnl" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon" aria-hidden="true">
              <IndianRupee size={16} strokeWidth={2} />
            </span>
            PnL
          </NavLink>
          {showBrokerReconciliation ? (
            <NavLink to="/broker-reconciliation" className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="nav-icon" aria-hidden="true">
                <Activity size={16} strokeWidth={2} />
              </span>
              Broker Recon
            </NavLink>
          ) : null}
          <NavLink to="/analytics" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon" aria-hidden="true">
              <CalendarDays size={16} strokeWidth={2} />
            </span>
            Analytics
          </NavLink>
          <NavLink to="/portfolio" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon" aria-hidden="true">
              <PieChart size={16} strokeWidth={2} />
            </span>
            Portfolio
          </NavLink>
        </nav>
        <div className="status-bar status-bar--stack">
          <div className="status-line">
            <span
              className={connected ? 'live-dot' : 'live-dot off'}
              title={reconnecting ? 'WebSocket reconnecting' : 'WebSocket'}
            />
            <span className="status-label">Feed</span>
            <span className="status-value">
              {connected ? 'Live' : reconnecting ? 'Reconnecting…' : 'Offline'}
            </span>
          </div>
          {lastEventAt && (
            <div className="font-mono text-[0.6rem] text-[var(--text-muted)] tabular-nums">
              Last WS {formatSyncTime(lastEventAt)} IST
            </div>
          )}
          {connectivity && (
            <div className="status-pipeline">
              <span title="RMS" className={rmsOk ? 'pip pip--ok' : 'pip pip--bad'}>
                RMS
              </span>
              <span title="TOE" className={toeOk ? 'pip pip--ok' : 'pip pip--bad'}>
                TOE
              </span>
              <span title="Redis" className={redisOk ? 'pip pip--ok' : 'pip pip--bad'}>
                Redis
              </span>
              {strategyWorkerStatus != null && (
                <span
                  title={`Strategy worker: ${strategyWorkerStatus}`}
                  className={strategyWorkerOk ? 'pip pip--ok' : 'pip pip--bad'}
                >
                  Worker
                </span>
              )}
              {!pipelineOk && <span className="status-hint">Execution path incomplete</span>}
            </div>
          )}
          <button
            type="button"
            className="mt-1 w-full rounded-desk-sm border border-desk-border bg-desk-panel/50 py-1 font-mono text-[0.6rem] text-desk-muted transition-colors hover:bg-white/5"
            onClick={() => refresh()}
          >
            Refresh health
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="top-bar top-bar--desk">
          <div className="top-bar-left">
            <span className="top-bar-label">Session</span>
            <span className="top-bar-title">Trading desk</span>
            <span
              className="ml-2 rounded-desk-sm border border-desk-border px-1.5 py-0.5 font-mono text-[0.58rem] uppercase tracking-wider text-desk-muted"
              title="Set VITE_DESK_ENV in .env for LIVE/PAPER/DEV"
            >
              <SlidersHorizontal className="mr-0.5 inline h-3 w-3" aria-hidden />
              {String(envBadge)}
            </span>
          </div>
          <div className="top-bar-center">
            <span className="clock-label">IST</span>
            <time className="clock-ist" dateTime={clock.toISOString()}>
              {formatISTClock(clock)}
            </time>
          </div>
          <div className="top-bar-right flex flex-wrap items-center gap-2">
            <span className="font-mono text-[0.65rem] text-[var(--text-muted)] tabular-nums">
              Sync {formatSyncTime(lastUpdated)} IST
            </span>
            <span className={`session-pill ${pipelineOk ? 'session-pill--ok' : 'session-pill--warn'}`}>
              {pipelineOk ? 'Pipeline ready' : 'Check pipeline'}
            </span>
            <NotificationBell deskAlerts={deskAlerts} onRefresh={refresh} />
            {authRequired ? (
              <button
                type="button"
                className="flex items-center gap-1 rounded-desk-sm border border-desk-border bg-desk-panel/60 px-2 py-1 font-mono text-[0.65rem] text-desk-muted transition-colors hover:bg-white/5"
                title={user ? `Signed in as ${user}` : 'Sign out'}
                onClick={async () => {
                  await logout();
                  navigate('/login', { replace: true });
                }}
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                Sign out
              </button>
            ) : null}
          </div>
        </header>
        <GlobalAlertStrip
          risk={risk}
          health={health}
          connectivity={connectivity}
          deskAlerts={deskAlerts}
          lastUpdated={lastUpdated}
        />
        <main id="main-content" className="main" tabIndex={-1}>
          <RouteErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/pnl" />} />
              <Route path="/setup" element={<ProtectedSetup><SetupAndRisk /></ProtectedSetup>} />
              <Route path="/manual-trade" element={<ManualTrade />} />
              <Route path="/settings" element={<Navigate to="/setup" replace />} />
              <Route path="/risk" element={<Navigate to="/setup" replace />} />
              <Route path="/dhan" element={<DhanAccount />} />
              <Route path="/kotak" element={<KotakAccount />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/pnl" element={<PnL />} />
              <Route path="/broker-reconciliation" element={showBrokerReconciliation ? <BrokerReconciliation /> : <Navigate to="/pnl" replace />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/calendar" element={<Navigate to="/analytics" replace />} />
              <Route path="/signals" element={<Signals />} />
            </Routes>
          </RouteErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function ProtectedSetup({ children }) {
  const { ready, isSetupAuthenticated } = useAuth();
  const location = useLocation();
  if (!ready) {
    return (
      <div className="login-page">
        <div className="login-panel login-panel--narrow">
          <p className="login-muted">Loading…</p>
        </div>
      </div>
    );
  }
  if (!isSetupAuthenticated) {
    const next = `${location.pathname}${location.search || ''}`;
    return <Navigate to={`/setup-unlock?next=${encodeURIComponent(next)}`} replace />;
  }
  return children;
}

function ProtectedDesk() {
  const { ready, authRequired, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="login-page">
        <div className="login-panel login-panel--narrow">
          <p className="login-muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (authRequired && !isAuthenticated) {
    const path = location.pathname === '/login' ? '/pnl' : `${location.pathname}${location.search || ''}`;
    return <Navigate to={`/login?next=${encodeURIComponent(path)}`} replace />;
  }

  if (location.pathname === '/setup-unlock') {
    return <SetupUnlock />;
  }

  return (
    <DeskShellProvider>
      <AppShell />
    </DeskShellProvider>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={<ProtectedDesk />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={routerBasename()}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
