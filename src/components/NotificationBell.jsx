import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, AlertTriangle, AlertOctagon, CircleSlash, Volume2, VolumeX } from 'lucide-react';
import { getStrategyDisplayName } from '../lib/strategyDisplayNames';
import { API, deskFetch } from '../config/deskApi';

const SOUND_KEY = 'desk_alert_sound_on';
// Served from the dashboard image root. /pnl/sounds/ 404s because nginx only aliases /pnl/assets/.
const SOUND_SRC = '/sounds/desk-alert.mp3';

function alertTitle(code) {
  if (code === 'BROKER_POSITION_MISMATCH') return 'Position mismatch';
  if (code === 'BROKER_PNL_DELTA') return 'PnL delta';
  return 'Backend event';
}

function alertType(code) {
  if (code === 'BROKER_POSITION_MISMATCH') return 'broker-mismatch';
  if (code === 'BROKER_PNL_DELTA') return 'broker-pnl';
  return 'ops';
}

/**
 * Small notification center for desk alerts.
 *
 * @param {{ deskAlerts: any, onRefresh?: () => void }} props
 */
export function NotificationBell({ deskAlerts, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [lastTotal, setLastTotal] = useState(0);
  const [hasNew, setHasNew] = useState(false);
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [dismissing, setDismissing] = useState(false);
  const seenIdsRef = useRef(new Set());
  const primedRef = useRef(false);
  const audioRef = useRef(null);
  const unlockedRef = useRef(false);

  const summary = deskAlerts?.summary || {};
  const rmsCount = summary.rms_rejections ?? deskAlerts?.risk_decisions?.count ?? 0;
  const backendCount = summary.backend_events ?? deskAlerts?.operational_alerts?.count ?? 0;
  const brokerCount = summary.broker_rejections ?? deskAlerts?.broker_rejections?.count ?? 0;
  const brokerMismatchCount = summary.broker_position_mismatches ?? 0;
  const brokerPnlCount = summary.broker_pnl_deltas ?? 0;
  const total = Number.isFinite(rmsCount + backendCount + brokerCount)
    ? rmsCount + backendCount + brokerCount
    : 0;

  const notifications = useMemo(() => {
    const list = [];

    const recentRisk = deskAlerts?.risk_decisions?.recent || [];
    for (const item of recentRisk) {
      const checks = (item.checks_failed || []).join(', ');
      const msg = [
        getStrategyDisplayName(item.strategy_id) || '—',
        item.reason_code || '—',
        checks || 'no checks_failed',
      ]
        .filter(Boolean)
        .join(' · ');
      list.push({
        key: `rms-${item.id || item.signal_id || item.ts_ist || item.ts}`,
        id: item.id || null,
        dismissable: Boolean(item.id),
        type: 'rms',
        title: 'RMS rejection',
        message: msg,
        tsSort: item.ts || '',
        tsDisplay: item.ts_ist || '—',
      });
    }

    const recentOps = deskAlerts?.operational_alerts?.recent || [];
    for (const item of recentOps) {
      list.push({
        key: `op-${item.id || item.ts_ist || item.ts}`,
        id: item.id || null,
        dismissable: Boolean(item.id),
        type: alertType(item.code),
        title: alertTitle(item.code),
        message: item.message || '—',
        tsSort: item.ts || '',
        tsDisplay: item.ts_ist || '—',
        fingerprint: item.meta?.fingerprint || '',
      });
    }

    const recentBr = deskAlerts?.broker_rejections?.recent || [];
    for (const item of recentBr) {
      const reason = (item.rejection_reason || '').trim();
      const msg = [
        item.broker_id || 'broker',
        getStrategyDisplayName(item.strategy_id) || '—',
        item.status || 'REJECTED',
        reason || item.broker_status || 'no reason text',
      ]
        .filter(Boolean)
        .join(' · ');
      list.push({
        key: `br-${item.id || item.signal_id || item.ts_ist || item.ts}`,
        id: item.id || null,
        dismissable: Boolean(item.id),
        type: 'broker',
        title: 'Broker order',
        message: msg,
        tsSort: item.ts || '',
        tsDisplay: item.ts_ist || '—',
      });
    }

    return list.sort((a, b) => {
      const ta = a.tsSort ? new Date(a.tsSort).getTime() : 0;
      const tb = b.tsSort ? new Date(b.tsSort).getTime() : 0;
      return tb - ta;
    });
  }, [deskAlerts]);

  useEffect(() => {
    if (total > lastTotal) {
      setHasNew(true);
    }
    setLastTotal(total);
  }, [total, lastTotal]);

  useEffect(() => {
    const ops = deskAlerts?.operational_alerts?.recent || [];
    const risk = deskAlerts?.risk_decisions?.recent || [];
    const broker = deskAlerts?.broker_rejections?.recent || [];
    const ids = [
      ...ops.map((x) => x.id || x.meta?.fingerprint || `${x.code}:${x.ts}`),
      ...risk.map((x) => x.id || `rms:${x.signal_id}:${x.ts}`),
      ...broker.map((x) => x.id || `br:${x.signal_id}:${x.ts}`),
    ].filter(Boolean);

    if (!primedRef.current) {
      ids.forEach((id) => seenIdsRef.current.add(id));
      primedRef.current = true;
      return;
    }

    const fresh = ids.filter((id) => !seenIdsRef.current.has(id));
    fresh.forEach((id) => seenIdsRef.current.add(id));
    if (fresh.length === 0 || !soundOn) return;

    playAlertSound();
  }, [deskAlerts, soundOn]);

  const hasAny = notifications.length > 0;
  const dismissableIds = notifications.filter((n) => n.dismissable && n.id).map((n) => n.id);

  const handleToggle = () => {
    if (!hasAny) return;
    setOpen((v) => !v);
    setHasNew(false);
    if (soundOn && !unlockedRef.current) {
      unlockedRef.current = true;
      playAlertSound();
    }
  };

  const playAlertSound = () => {
    try {
      if (!audioRef.current) {
        const audio = new Audio(SOUND_SRC);
        audio.preload = 'auto';
        audioRef.current = audio;
      }
      audioRef.current.currentTime = 0;
      const played = audioRef.current.play();
      if (played && typeof played.catch === 'function') {
        played.catch(() => {});
      }
    } catch {
      /* autoplay may be blocked until a user gesture */
    }
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (next) {
      unlockedRef.current = true;
      playAlertSound();
    }
  };

  const dismissIds = async (ids) => {
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (!unique.length || dismissing) return;
    setDismissing(true);
    try {
      const r = await deskFetch(`${API}/desk/alerts/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unique }),
      });
      if (r.ok && typeof onRefresh === 'function') {
        await onRefresh();
      }
    } finally {
      setDismissing(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className={`inline-flex items-center rounded-full border border-desk-border px-2 py-1 text-[0.75rem] text-desk-muted hover:bg-white/5 ${
          !hasAny ? 'opacity-60 cursor-default' : ''
        }`}
        aria-label="Desk notifications"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="mr-1 h-3.5 w-3.5" aria-hidden />
        <span>Alerts</span>
        {total > 0 && (
          <span
            className={`ml-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[0.7rem] font-mono text-slate-950 tabular-nums ${
              hasNew ? 'animate-pulse' : ''
            }`}
          >
            {total}
          </span>
        )}
      </button>
      {open && hasAny && (
        <div className="absolute right-0 z-20 mt-1 w-96 max-w-[90vw] rounded-desk-md border border-desk-border bg-[rgba(15,23,42,0.98)] p-2 shadow-xl">
          <div className="mb-1 flex items-center justify-between gap-2 text-[0.7rem] text-desk-muted">
            <span>Recent desk alerts</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSound}
                className="inline-flex items-center gap-1 rounded border border-desk-border px-1.5 py-0.5 hover:bg-white/5"
                title={soundOn ? 'Sound on' : 'Sound off'}
              >
                {soundOn ? (
                  <Volume2 className="h-3 w-3" aria-hidden />
                ) : (
                  <VolumeX className="h-3 w-3" aria-hidden />
                )}
                <span>{soundOn ? 'Sound on' : 'Sound off'}</span>
              </button>
              {dismissableIds.length > 0 && (
                <button
                  type="button"
                  disabled={dismissing}
                  onClick={() => dismissIds(dismissableIds)}
                  className="rounded border border-desk-border px-1.5 py-0.5 hover:bg-white/5 disabled:opacity-50"
                >
                  Dismiss all
                </button>
              )}
            </div>
          </div>
          <div className="mb-1 text-[0.65rem] text-desk-muted">
            RMS {rmsCount} · Broker {brokerCount} · Pos {brokerMismatchCount} · PnL {brokerPnlCount} ·
            Backend {backendCount}
          </div>
          <div className="max-h-72 space-y-1 overflow-auto pr-1 text-[0.75rem]">
            {notifications.map((n) => (
              <div
                key={n.key}
                className="flex items-start gap-2 rounded-desk-sm bg-slate-900/80 px-2 py-1.5"
              >
                {n.type === 'rms' ? (
                  <AlertTriangle className="mt-[2px] h-3.5 w-3.5 text-amber-300" aria-hidden />
                ) : n.type === 'broker' ? (
                  <CircleSlash className="mt-[2px] h-3.5 w-3.5 text-violet-300" aria-hidden />
                ) : n.type === 'broker-pnl' ? (
                  <AlertOctagon className="mt-[2px] h-3.5 w-3.5 text-amber-300" aria-hidden />
                ) : (
                  <AlertOctagon className="mt-[2px] h-3.5 w-3.5 text-red-300" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{n.title}</span>
                    <span className="whitespace-nowrap font-mono text-[0.65rem] text-desk-muted tabular-nums">
                      {n.tsDisplay}
                    </span>
                  </div>
                  <div className="mt-0.5 break-words text-[0.72rem] text-slate-100">{n.message}</div>
                  {n.dismissable && (
                    <button
                      type="button"
                      disabled={dismissing}
                      onClick={() => dismissIds([n.id])}
                      className="mt-1 rounded border border-desk-border px-1.5 py-0.5 text-[0.65rem] text-desk-muted hover:bg-white/5 disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            ))}
            {notifications.length === 0 && (
              <div className="rounded-desk-sm bg-slate-900/50 px-2 py-2 text-center text-[0.75rem] text-desk-muted">
                No desk alerts in the current window.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
