import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DeskTable } from '../components/DeskTable';
import { useApiPoll } from '../hooks/useApiPoll';
import { getDeskBookConfig } from '../config/deskProfile';
import { API } from '../config/deskApi';
import { getStrategyDisplayName } from '../lib/strategyDisplayNames';

const POLL_MS = 2_000;
const DESK_BOOK = getDeskBookConfig();

function fmtINR(v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return Number(v).toLocaleString('en-IN');
}

function fmtPositionQty(v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  if (n === 0) return 'Flat';
  return `${fmtQty(Math.abs(n))} ${n > 0 ? 'BUY' : 'SELL'}`;
}

function fmtFilledQty(v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  if (n === 0) return 'No net fill';
  return `${fmtQty(Math.abs(n))} ${n > 0 ? 'BUY' : 'SELL'} net`;
}

function cleanStrategyName(id) {
  return String(id || '')
    .split(',')
    .map((part) => getStrategyDisplayName(part.trim()))
    .filter(Boolean)
    .join(', ');
}

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function statusTone(status) {
  if (status === 'OK') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  if (status === 'MISMATCH') return 'border-red-500/40 bg-red-500/10 text-red-300';
  return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
}

function issueTone(issue) {
  if (!issue || issue === 'Matched') return 'border-emerald-500/40 text-emerald-300';
  if (String(issue).toLowerCase().includes('broker')) return 'border-red-500/40 text-red-300';
  return 'border-amber-500/40 text-amber-200';
}

function SummaryCard({ label, value, hint, tone = '' }) {
  return (
    <div className="rounded-desk-md border border-desk-border bg-desk-panel/70 p-4">
      <div className="font-mono text-[0.65rem] uppercase tracking-wider text-desk-muted">{label}</div>
      <div className={`mt-2 font-mono text-xl tabular-nums ${tone}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-desk-muted">{hint}</div> : null}
    </div>
  );
}

export default function BrokerReconciliation() {
  const [snapshot, setSnapshot] = useState(null);
  const [stateAlerts, setStateAlerts] = useState([]);
  const [confirmEnabled, setConfirmEnabled] = useState(false);
  const [pendingAlert, setPendingAlert] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await fetch(`${API}/reconciliation/broker-snapshot?broker=${DESK_BOOK.broker}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.detail || `Reconciliation API ${r.status}`);
      setSnapshot(d);
      const alerts = await fetch(`${API}/reconciliation/state-alerts`);
      const alertBody = await alerts.json().catch(() => ({}));
      if (alerts.ok) {
        setStateAlerts(alertBody.alerts || []);
        setConfirmEnabled(Boolean(alertBody.confirm_enabled));
      }
    } catch (e) {
      setError(e?.message || 'Failed to load broker reconciliation');
    } finally {
      setLoading(false);
    }
  }, []);

  const confirmReconcile = useCallback(async () => {
    if (!pendingAlert) return;
    setConfirmBusy(true);
    setError('');
    try {
      const r = await fetch(`${API}/reconciliation/state-alerts/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_id: pendingAlert.alert_id,
          fingerprint: pendingAlert.fingerprint,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.detail || `Confirm failed ${r.status}`);
      setPendingAlert(null);
      await load();
    } catch (e) {
      setError(e?.message || 'Reconcile confirm failed');
    } finally {
      setConfirmBusy(false);
    }
  }, [pendingAlert, load]);

  useApiPoll(load, POLL_MS, true, [load]);

  const rows = snapshot?.position_rows || [];
  const internalRows = snapshot?.internal_qty_mismatches || [];
  const status = snapshot?.status || (loading ? 'LOADING' : 'UNKNOWN');
  const positionIssueCount = snapshot?.mismatch_count ?? rows.filter((row) => !row.qty_match).length;
  const todayFillIssueCount = internalRows.length;

  const positionColumns = useMemo(() => [
    {
      accessorKey: 'contract_label',
      header: 'Contract',
      cell: ({ row }) => (
        <div>
          <div className="font-mono text-xs text-desk-text">{row.original.contract_label || row.original.symbol || '—'}</div>
          <div className="font-mono text-[0.65rem] text-desk-muted">{row.original.exchange_segment || row.original.product_type || 'Current contract'}</div>
        </div>
      ),
    },
    {
      accessorKey: 'strategy_label',
      header: 'Strategy',
      cell: ({ row, getValue }) => {
        const labels = row.original.strategy_labels || [];
        if (labels.length) return labels.join(', ');
        return getValue() || (row.original.desk_strategies || []).map(cleanStrategyName).join(', ') || '—';
      },
    },
    {
      accessorKey: 'desk_net_qty',
      header: 'Desk Position',
      cell: ({ getValue }) => fmtPositionQty(getValue()),
      meta: { numeric: true },
    },
    {
      accessorKey: 'broker_net_qty',
      header: 'Broker Position',
      cell: ({ getValue }) => fmtPositionQty(getValue()),
      meta: { numeric: true },
    },
    {
      accessorKey: 'broker_unrealized',
      header: 'PnL',
      cell: ({ row }) => {
        const brokerQty = Number(row.original.broker_net_qty || 0);
        if (brokerQty === 0) return '—';
        const ltp = row.original.broker_ltp;
        return (
          <div>
            <div className="font-mono tabular-nums">R ₹{fmtINR(row.original.broker_realized)}</div>
            <div className="font-mono tabular-nums">U ₹{fmtINR(row.original.broker_unrealized)}</div>
            {ltp != null ? (
              <div className="font-mono text-[0.65rem] text-desk-muted">LTP ₹{fmtINR(ltp)}</div>
            ) : null}
          </div>
        );
      },
      meta: { numeric: true },
    },
    {
      accessorKey: 'issue',
      header: 'Status',
      cell: ({ row, getValue }) => {
        const issue = getValue() || (row.original.qty_match ? 'Matched' : 'Quantity differs');
        return <span className={`rounded border px-2 py-0.5 font-mono text-[0.65rem] ${issueTone(issue)}`}>{issue}</span>;
      },
    },
  ], []);

  const internalColumns = useMemo(() => [
    {
      accessorKey: 'strategy_label',
      header: 'Strategy',
      cell: ({ row, getValue }) => getValue() || cleanStrategyName(row.original.strategy_id),
    },
    {
      accessorKey: 'contract_label',
      header: 'Contract',
      cell: ({ getValue }) => getValue() || '—',
    },
    {
      accessorKey: 'today_filled_qty',
      header: 'Today Filled',
      cell: ({ row, getValue }) => fmtFilledQty(getValue() ?? row.original.net_filled_qty),
      meta: { numeric: true },
    },
    {
      accessorKey: 'current_position_qty',
      header: 'Current Position',
      cell: ({ row, getValue }) => fmtPositionQty(getValue() ?? row.original.position_qty),
      meta: { numeric: true },
    },
    {
      accessorKey: 'issue',
      header: 'Issue',
      cell: ({ getValue }) => <span className="text-amber-200">{getValue() || 'Today fills do not match current position'}</span>,
    },
  ], []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-desk-text">Broker Reconciliation</h1>
          <p className="mt-1 text-sm text-desk-muted">
            {DESK_BOOK.broker === 'kotak_sandbox'
              ? 'Read-only comparison of the live desk book against Kotak positions.'
              : 'Read-only comparison of the live desk book against Dhan /v2/positions.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-desk-sm border px-2 py-1 font-mono text-xs ${statusTone(status)}`}>
            {status}
          </span>
          <span className="font-mono text-xs text-desk-muted">Checked {fmtTime(snapshot?.checked_at)} IST</span>
          <button
            type="button"
            onClick={load}
            className="rounded-desk-sm border border-desk-border bg-desk-panel/80 px-3 py-1.5 text-sm text-desk-text transition-colors hover:bg-white/5"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-desk-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Current Positions"
          value={fmtQty(snapshot?.desk_position_count)}
          hint="Open desk legs in the broker book"
          tone={positionIssueCount ? 'text-red-300' : 'text-emerald-300'}
        />
        <SummaryCard
          label="Position Issues"
          value={fmtQty(positionIssueCount)}
          hint="Current desk vs broker differences"
          tone={positionIssueCount ? 'text-red-300' : 'text-emerald-300'}
        />
        <SummaryCard
          label="Today Fill Issues"
          value={fmtQty(todayFillIssueCount)}
          hint="Today fills vs current desk positions"
          tone={todayFillIssueCount ? 'text-red-300' : 'text-emerald-300'}
        />
        <SummaryCard
          label="Broker PnL"
          value={`₹${fmtINR(snapshot?.broker_pnl?.total)}`}
          hint={
            DESK_BOOK.broker === 'kotak_sandbox'
              ? `R ₹${fmtINR(snapshot?.broker_pnl?.realized)} / U ₹${fmtINR(snapshot?.broker_pnl?.unrealized)} (live tick mark)`
              : `R ₹${fmtINR(snapshot?.broker_pnl?.realized)} / U ₹${fmtINR(snapshot?.broker_pnl?.unrealized)} (open, LTP-polled)`
          }
        />
      </div>

      {snapshot?.message ? (
        <div className="rounded-desk-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          {snapshot.message}
        </div>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-mono text-sm uppercase tracking-wider text-desk-muted">Strategy book alerts</h2>
        <p className="text-xs text-desk-muted">The recon service only raises these alerts. A repair runs after you confirm one row.</p>
        <div className="overflow-x-auto rounded-desk-md border border-desk-border">
          <table className="min-w-full text-left text-sm">
            <thead className="font-mono text-[0.65rem] uppercase tracking-wider text-desk-muted">
              <tr>
                <th className="px-3 py-2">Strategy</th>
                <th className="px-3 py-2">Contract</th>
                <th className="px-3 py-2">Strategy qty</th>
                <th className="px-3 py-2">Infra qty</th>
                <th className="px-3 py-2">Broker qty</th>
                <th className="px-3 py-2">Proposed</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {stateAlerts.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-desk-muted" colSpan={7}>No open strategy-book alerts</td>
                </tr>
              ) : stateAlerts.map((alert) => (
                <tr key={alert.alert_id || alert.fingerprint} className="border-t border-desk-border">
                  <td className="px-3 py-2 font-mono text-xs">{alert.strategy_id}</td>
                  <td className="px-3 py-2 font-mono text-xs">{alert.instrument}</td>
                  <td className="px-3 py-2 font-mono tabular-nums">{fmtQty(alert.strategy_qty)}</td>
                  <td className="px-3 py-2 font-mono tabular-nums">{fmtQty(alert.infra_qty)}</td>
                  <td className="px-3 py-2 font-mono tabular-nums">{fmtQty(alert.broker_qty)}</td>
                  <td className="px-3 py-2 text-xs">{alert.text}</td>
                  <td className="px-3 py-2">
                    {alert.actionable && confirmEnabled ? (
                      <button
                        type="button"
                        className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-200"
                        onClick={() => setPendingAlert(alert)}
                      >
                        Reconcile
                      </button>
                    ) : (
                      <span className="text-xs text-desk-muted">{alert.actionable ? 'Confirm off' : 'No button'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pendingAlert ? (
          <div className="rounded-desk-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p>Confirm {pendingAlert.text} for {pendingAlert.strategy_id} {pendingAlert.instrument}?</p>
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={confirmBusy} className="rounded bg-red-500/20 px-3 py-1 text-red-100" onClick={confirmReconcile}>
                {confirmBusy ? 'Working…' : 'Confirm reconcile'}
              </button>
              <button type="button" disabled={confirmBusy} className="rounded border border-desk-border px-3 py-1" onClick={() => setPendingAlert(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-mono text-sm uppercase tracking-wider text-desk-muted">Current Position Reconciliation</h2>
          <div className="flex gap-2 text-xs">
            <Link className="text-desk-accent hover:underline" to="/orders">Open Orders</Link>
            <Link className="text-desk-accent hover:underline" to="/pnl">Open PnL</Link>
          </div>
        </div>
        <DeskTable
          data={rows}
          columns={positionColumns}
          getRowId={(row) => row.security_id}
          emptyTitle={loading ? 'Loading broker positions...' : 'No broker or desk positions'}
          emptyHint="Current desk and broker books are flat."
          getRowClassName={(row) => row.qty_match ? '' : 'bg-red-500/5'}
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-mono text-sm uppercase tracking-wider text-desk-muted">Today's Fill Consistency</h2>
        <DeskTable
          data={internalRows}
          columns={internalColumns}
          getRowId={(row) => `${row.strategy_id}-${row.security_id}`}
          emptyTitle="Today fills match current positions"
          emptyHint="No current-day fill consistency issues."
          getRowClassName={() => 'bg-red-500/5'}
        />
      </section>
    </div>
  );
}
