import { AlertTriangle, AlertOctagon, ShieldAlert, WifiOff } from 'lucide-react';
import { cn } from '../lib/utils';

function formatTime(d) {
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
    return '—';
  }
}

/**
 * @param {object} props
 * @param {object | null} props.risk
 * @param {object | null} props.health
 * @param {object | null} props.connectivity
 * @param {object | null} props.deskAlerts — GET /api/desk/alerts (RMS rejections + operational)
 * @param {Date | null} props.lastUpdated
 */
export function GlobalAlertStrip({ risk, health, connectivity, deskAlerts, lastUpdated }) {
  const lines = [];

  const backendDown = connectivity?.backend === 'error' || !connectivity;
  if (backendDown) {
    lines.push({
      key: 'backend',
      icon: WifiOff,
      tone: 'danger',
      text: 'Backend unreachable — check connectivity and proxy.',
    });
  }

  if (risk?.emergency_env_halt) {
    lines.push({
      key: 'env-halt',
      icon: AlertOctagon,
      tone: 'danger',
      text: 'EMERGENCY_TRADING_HALT is set in environment.',
    });
  }

  if (risk?.trading_halted) {
    lines.push({
      key: 'halt',
      icon: ShieldAlert,
      tone: 'warning',
      text: 'Trading halt active — new entries blocked; kill-switch may apply.',
    });
  }

  const blocked = risk?.stale_session?.current_blocked || [];
  if (Array.isArray(blocked) && blocked.length > 0) {
    lines.push({
      key: 'stale',
      icon: AlertTriangle,
      tone: 'warning',
      text: `Stale session carryover — new entries blocked for: ${blocked.join(', ')}`,
    });
  }

  const carry = health?.stale_session_carryover_legs ?? risk?.stale_session?.carryover_count;
  if (typeof carry === 'number' && carry > 0 && !lines.find((l) => l.key === 'stale')) {
    lines.push({
      key: 'stale-legs',
      icon: AlertTriangle,
      tone: 'warning',
      text: `${carry} prior-day intraday leg(s) open — close before new entries.`,
    });
  }

  const integ = health?.integrity_issue_count ?? (risk?.integrity?.issues?.length ?? 0);
  if (typeof integ === 'number' && integ > 0) {
    lines.push({
      key: 'integrity',
      icon: AlertTriangle,
      tone: 'warning',
      text: `${integ} integrity issue(s) reported — review Setup & Risk.`,
    });
  }

  const rmsN = deskAlerts?.summary?.rms_rejections ?? deskAlerts?.risk_decisions?.count;
  const staleN = deskAlerts?.summary?.stale_signal_hits;
  const brokerMismatchN = deskAlerts?.summary?.broker_position_mismatches ?? 0;
  const brokerPnlN = deskAlerts?.summary?.broker_pnl_deltas ?? 0;
  const opN = deskAlerts?.summary?.backend_events ?? deskAlerts?.operational_alerts?.count;
  const accounted =
    (typeof brokerMismatchN === 'number' ? brokerMismatchN : 0) +
    (typeof brokerPnlN === 'number' ? brokerPnlN : 0);
  const otherOpN = typeof opN === 'number' ? Math.max(0, opN - accounted) : opN;
  if (typeof brokerMismatchN === 'number' && brokerMismatchN > 0) {
    lines.push({
      key: 'broker-position-mismatch',
      icon: AlertOctagon,
      tone: 'danger',
      text: `Position mismatch — ${brokerMismatchN} in last ${deskAlerts?.window_minutes ?? '—'}m. Open Broker Recon.`,
    });
  }
  if (typeof brokerPnlN === 'number' && brokerPnlN > 0) {
    lines.push({
      key: 'broker-pnl-delta',
      icon: AlertOctagon,
      tone: 'warning',
      text: `PnL delta — ${brokerPnlN} in last ${deskAlerts?.window_minutes ?? '—'}m. Open Broker Recon.`,
    });
  }
  if (typeof rmsN === 'number' && rmsN > 0) {
    const top = deskAlerts?.risk_decisions?.by_check;
    const topStr =
      top && typeof top === 'object'
        ? Object.entries(top)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([k, v]) => `${k}(${v})`)
            .join(', ')
        : '';
    const stalePart = typeof staleN === 'number' && staleN > 0 ? ` · stale/time_freshness: ${staleN}` : '';
    lines.push({
      key: 'rms-rejections',
      icon: AlertTriangle,
      tone: 'warning',
      text: `RMS rejected ${rmsN} signal(s) in last ${deskAlerts?.window_minutes ?? '—'}m${stalePart}${topStr ? ` — ${topStr}` : ''}`,
    });
  }
  if (typeof otherOpN === 'number' && otherOpN > 0) {
    lines.push({
      key: 'backend-ops',
      icon: AlertTriangle,
      tone: 'warning',
      text: `${otherOpN} backend operational alert(s) (Redis/publish/loops — search logs DESK_EVENT).`,
    });
  }

  if (lines.length === 0) return null;

  return (
    <div
      className="border-b border-[var(--border)] bg-[rgba(15,23,42,0.98)] px-4 py-2"
      role="region"
      aria-label="Operational alerts"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.75rem]">
        {lines.map(({ key, icon: Icon, tone, text }) => (
          <div
            key={key}
            className={cn(
              'flex items-center gap-1.5 font-sans',
              tone === 'danger' && 'text-red-300',
              tone === 'warning' && 'text-amber-200'
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
            <span>{text}</span>
          </div>
        ))}
        <span className="ml-auto font-mono text-[0.65rem] text-[var(--text-muted)] tabular-nums">
          Data sync {formatTime(lastUpdated)} IST
        </span>
      </div>
    </div>
  );
}
