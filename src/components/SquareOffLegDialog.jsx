import { useEffect, useRef } from 'react';
import { formatCfgExpiry } from '../utils/manualTradeHelpers';
import { cn } from '../lib/utils';
import { getStrategyDisplayName } from '../lib/strategyDisplayNames';

function shortStrategyName(id) {
  if (id == null || id === '') return '—';
  return getStrategyDisplayName(id);
}

function cell(v) {
  if (v == null || v === '') return '—';
  return String(v);
}

/**
 * Confirmation overlay before per-leg RMS square-off (PnL open positions).
 */
export function SquareOffLegDialog({ open, position, busy, onCancel, onConfirm }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const id = requestAnimationFrame(() => cancelRef.current?.focus());
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, busy, onCancel]);

  if (!open || !position) return null;

  const exp = formatCfgExpiry(position.expiry);
  const expiryDisplay = exp || '—';

  const btnBase =
    'inline-flex min-h-[2rem] items-center justify-center rounded-desk-sm px-3 py-1.5 text-[0.75rem] font-semibold tracking-wide transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--desk-bg,#0f1419)] disabled:cursor-not-allowed disabled:opacity-55';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
      role="presentation"
      onMouseDown={() => !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="squareoff-leg-dialog-title"
        className={cn(
          'max-w-md w-full rounded-desk-sm border border-desk-border bg-[var(--desk-bg,#0f1419)] shadow-xl shadow-black/40',
          'p-4 sm:p-5'
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="squareoff-leg-dialog-title" className="text-base font-semibold text-desk-text">
          Square off this leg?
        </h2>
        <p className="mt-1 text-[0.7rem] text-desk-muted">RMS will send an EXIT for this contract at the broker.</p>

        <dl className="mt-4 grid grid-cols-[minmax(5rem,auto)_1fr] gap-x-4 gap-y-2 text-[0.8rem]">
          <dt className="text-desk-muted">Strategy</dt>
          <dd className="font-mono text-desk-text tabular-nums">{shortStrategyName(position.strategy_id)}</dd>
          <dt className="text-desk-muted">Symbol</dt>
          <dd className="font-mono text-desk-text">{cell(position.underlying)}</dd>
          <dt className="text-desk-muted">Expiry</dt>
          <dd className="font-mono text-desk-text tabular-nums">{expiryDisplay}</dd>
          <dt className="text-desk-muted">Strike</dt>
          <dd className="font-mono text-desk-text tabular-nums">{cell(position.strike)}</dd>
          <dt className="text-desk-muted">Type</dt>
          <dd className="font-mono text-desk-text">{cell(position.option_type)}</dd>
          <dt className="text-desk-muted">Side</dt>
          <dd className="font-mono text-desk-text">{cell(position.side)}</dd>
          <dt className="text-desk-muted">Qty</dt>
          <dd className="font-mono text-desk-text tabular-nums">{cell(position.quantity)} contracts</dd>
        </dl>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            className={`${btnBase} border border-desk-border bg-transparent text-desk-text hover:bg-white/5 focus-visible:ring-desk-muted`}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            className={`${btnBase} border border-orange-500/70 bg-orange-600/90 text-white shadow-md shadow-orange-900/40 hover:bg-orange-500 focus-visible:ring-orange-400`}
            onClick={onConfirm}
          >
            {busy ? 'Sending…' : 'Confirm square off'}
          </button>
        </div>
      </div>
    </div>
  );
}
