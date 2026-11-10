/**
 * Desk build profile: mock server vs broker server.
 * - VITE_DESK_PROFILE=mock | broker | kotak — single book, no rail toggle.
 * - Unset or other — Mock, Dhan sandbox, and Kotak sandbox for local dev.
 *
 * `broker` uses dhan_sandbox only when VITE_DEFAULT_BROKER is dhan_sandbox. Any other value, including the Dockerfile default mock, is kotak_sandbox.
 * Kotak UAT is `kotak_sandbox` (profile `kotak`, or VITE_DEFAULT_BROKER).
 */
export function apiBrokerId(broker) {
  const desk = getDeskBookConfig().broker;
  const id = String(broker || '').trim().toLowerCase();
  if (desk === 'kotak_sandbox' && id !== 'dhan_sandbox') return 'kotak_sandbox';
  if (id === 'dhan_sandbox' || id === 'kotak_sandbox' || id === 'mock') return id;
  if (desk === 'dhan_sandbox' || desk === 'mock') return desk;
  return 'mock';
}

export function getDeskBookConfig() {
  const profile = (import.meta.env.VITE_DESK_PROFILE || '').trim().toLowerCase();
  const def = (import.meta.env.VITE_DEFAULT_BROKER || 'mock').trim().toLowerCase();
  const broker =
    profile === 'mock'
      ? (def === 'kotak_sandbox' || def === 'dhan_sandbox' ? def : 'mock')
      : profile === 'broker'
        ? def === 'dhan_sandbox'
          ? 'dhan_sandbox'
          : 'kotak_sandbox'
        : profile === 'kotak'
          ? 'kotak_sandbox'
          : def === 'dhan_sandbox'
            ? 'dhan_sandbox'
            : def === 'kotak_sandbox'
              ? 'kotak_sandbox'
              : 'mock';

  const liveLabel = (import.meta.env.VITE_BROKER_BOOK_LABEL || 'Live').trim() || 'Live';
  const locked = profile === 'mock' || profile === 'broker' || profile === 'kotak';

  const segments = locked
    ? [
        {
          label: profile === 'mock' ? 'Mock' : profile === 'kotak' ? 'Kotak sandbox' : liveLabel,
          value: broker,
        },
      ]
    : [
        { label: 'Mock', value: 'mock' },
        { label: 'Dhan Sandbox', value: 'dhan_sandbox' },
        { label: 'Kotak Sandbox', value: 'kotak_sandbox' },
      ];

  const bookChip =
    profile === 'broker'
      ? liveLabel
      : broker === 'mock'
        ? 'Mock'
        : broker === 'kotak_sandbox'
          ? 'Kotak sandbox'
          : 'Dhan sandbox';

  /** IST YYYY-MM-DD — Analytics hides earlier days for broker desk; Mongo unchanged. */
  const analyticsMinDate = profile === 'broker' ? '2026-05-21' : null;

  return { profile, broker, locked, segments, bookChip, analyticsMinDate };
}


export function isBrokerReconciliationDesk() {
  const profile = getDeskBookConfig().profile;
  return profile === 'broker' || profile === 'mock';
}
