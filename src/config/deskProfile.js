export function apiBrokerId(broker) {
  const desk = getDeskBookConfig().broker;
  const id = String(broker || '').trim().toLowerCase();
  if (desk === 'kotak_sandbox' && id !== 'dhan_sandbox') return 'kotak_sandbox';
  if (id === 'dhan_sandbox' || id === 'kotak_sandbox' || id === 'mock') return id;
  if (desk === 'dhan_sandbox' || desk === 'mock') return desk;
  return 'mock';
}

/**
 * Desk build profile: mock server vs broker server.
 * - VITE_DESK_PROFILE=mock | broker — single book, no rail toggle (recommended for prod desks).
 * - Unset or other — dual rail (Mock + Dhan sandbox) for local dev.
 *
 * API broker id stays `mock` | `dhan_sandbox`; broker profile only changes labels (e.g. "Live").
 */
export function getDeskBookConfig() {
  const profile = (import.meta.env.VITE_DESK_PROFILE || '').trim().toLowerCase();
  const def = (import.meta.env.VITE_DEFAULT_BROKER || 'mock').trim().toLowerCase();
  const broker =
    profile === 'mock'
      ? (def === 'kotak_sandbox' || def === 'dhan_sandbox' ? def : 'mock')
      : profile === 'broker'
        ? (def === 'dhan_sandbox' ? 'dhan_sandbox' : 'kotak_sandbox')
        : def === 'dhan_sandbox'
          ? 'dhan_sandbox'
          : 'mock';

  const liveLabel = (import.meta.env.VITE_BROKER_BOOK_LABEL || 'Live').trim() || 'Live';
  const locked = profile === 'mock' || profile === 'broker';

  const segments = locked
    ? [
        {
          label: profile === 'mock' ? 'Mock' : liveLabel,
          value: broker,
        },
      ]
    : [
        { label: 'Mock', value: 'mock' },
        { label: 'Dhan Sandbox', value: 'dhan_sandbox' },
      ];

  const bookChip =
    broker === 'mock' ? 'Mock' : profile === 'broker' ? liveLabel : 'Dhan sandbox';

  /** IST YYYY-MM-DD — Analytics hides earlier days for broker desk; Mongo unchanged. */
  const analyticsMinDate = profile === 'broker' ? '2026-05-21' : null;

  return { profile, broker, locked, segments, bookChip, analyticsMinDate };
}


/** Top-bar title. Broker builds are live; mock builds are mock; an unset profile follows the book. */
export function deskSessionTitle() {
  const { profile, broker } = getDeskBookConfig();
  if (profile === 'mock') return 'Mock trading desk';
  if (profile === 'broker') return 'Live trading desk';
  return broker === 'mock' ? 'Mock trading desk' : 'Live trading desk';
}

export function isBrokerReconciliationDesk() {
  const profile = getDeskBookConfig().profile;
  return profile === 'broker' || profile === 'mock';
}
