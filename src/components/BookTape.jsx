import { useCallback, useEffect, useState } from 'react';
import { API } from '../config/deskApi';
import { apiBrokerId, getDeskBookConfig } from '../config/deskProfile';
import { useDeskShell } from '../context/DeskShellContext';
import { useApiPoll } from '../hooks/useApiPoll';
import { cn } from '../lib/utils';
import { toISTTime } from '../utils/formatIST';

const DESK_BOOK = getDeskBookConfig();

function pnlColor(val) {
  if (val > 0) return 'green';
  if (val < 0) return 'red';
  return '';
}

function inr(val) {
  return `₹${Number(val || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function BookTape() {
  const { lastMessage } = useDeskShell();
  const [data, setData] = useState(null);
  const broker = DESK_BOOK.broker;

  const load = useCallback(() => {
    const q = broker ? `?broker=${broker}` : '';
    fetch(`${API}/pnl${q}`)
      .then((r) => {
        if (!r.ok) throw new Error(`PnL API ${r.status}`);
        return r.json();
      })
      .then((d) => setData(d))
      .catch(() => {});
  }, [broker]);

  useApiPoll(load, 1000, true, [broker]);

  useEffect(() => {
    if (!lastMessage || lastMessage.type !== 'pnl_snapshot' || !lastMessage.payload) return;
    const payloadBroker = lastMessage.payload.broker;
    if (
      payloadBroker != null &&
      String(payloadBroker).trim() !== '' &&
      apiBrokerId(payloadBroker) !== broker
    ) {
      return;
    }
    setData(lastMessage.payload);
  }, [lastMessage, broker]);

  const realized = data?.realized_pnl ?? 0;
  const unrealized = data?.unrealized_pnl ?? 0;
  const total = realized + unrealized;
  const strategyCount = Object.keys(data?.strategies || {}).length;

  return (
    <section className="desk-book-tape" aria-label="Book snapshot">
      <div className="pnl-desk-tape__scroll">
        <span className="pnl-desk-tape__chip pnl-desk-tape__chip--accent">
          {DESK_BOOK.bookChip} book
        </span>
        <span className="pnl-desk-tape__metric">
          <span className="pnl-desk-tape__k">Total</span>
          <span className={cn('pnl-desk-tape__v', pnlColor(total))}>{inr(total)}</span>
        </span>
        <span className="pnl-desk-tape__metric">
          <span className="pnl-desk-tape__k">Realised</span>
          <span className={cn('pnl-desk-tape__v', pnlColor(realized))}>{inr(realized)}</span>
        </span>
        <span className="pnl-desk-tape__metric">
          <span className="pnl-desk-tape__k">Unrealised</span>
          <span className={cn('pnl-desk-tape__v', pnlColor(unrealized))}>{inr(unrealized)}</span>
        </span>
        <span className="pnl-desk-tape__metric">
          <span className="pnl-desk-tape__k">Strategies</span>
          <span className="pnl-desk-tape__v" style={{ color: 'var(--text)' }}>
            {strategyCount}
          </span>
        </span>
        <span className="pnl-desk-tape__metric pnl-desk-tape__metric--mono">
          <span className="pnl-desk-tape__k">Mark</span>
          <span className="pnl-desk-tape__v">{data?.ts ? toISTTime(data.ts) : '—'}</span>
        </span>
      </div>
    </section>
  );
}
