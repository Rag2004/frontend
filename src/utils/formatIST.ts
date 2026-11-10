/**
 * Format ISO timestamp (UTC) to IST for display.
 */
function parseAsUTC(isoStr: string | null | undefined): Date | null {
  if (!isoStr) return null;
  const s = String(isoStr).trim();
  // Naive UTC from the desk: ISO with T, or Python str(datetime) with a space.
  // Without a Z, browsers treat the space form as local time and shift the clock.
  if (
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) &&
    !/[Zz]$/.test(s) &&
    !/[+-]\d{2}:?\d{2}$/.test(s)
  ) {
    return new Date(`${s.replace(' ', 'T')}Z`);
  }
  return new Date(s);
}

export function toIST(isoStr: string | null | undefined): string {
  if (!isoStr) return '-';
  try {
    const d = parseAsUTC(isoStr);
    if (!d || Number.isNaN(d.getTime())) return String(isoStr);
    return (
      d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'medium',
      }) + ' IST'
    );
  } catch {
    return String(isoStr);
  }
}

export function toISTTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '-';
  try {
    const d = parseAsUTC(isoStr);
    if (!d || Number.isNaN(d.getTime())) return String(isoStr);
    return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST';
  } catch {
    return String(isoStr);
  }
}

/** Compact IST for RMS decision tape */
export function toISTCompact(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  try {
    const d = parseAsUTC(isoStr);
    if (!d || Number.isNaN(d.getTime())) return String(isoStr);
    const day = d.getDate().toString().padStart(2, '0');
    const mon = d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short' });
    const time = d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    return `${day} ${mon}, ${time} IST`;
  } catch {
    return String(isoStr);
  }
}
