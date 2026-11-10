import { useEffect, useRef } from 'react';

/**
 * Runs `fn` immediately when deps change, then on a fixed interval.
 * @param {() => void | Promise<void>} fn
 * @param {number} intervalMs
 * @param {boolean} enabled
 * @param {unknown[]} deps - when any change, re-run immediately + reset interval
 */
export function useApiPoll(fn, intervalMs = 5000, enabled = true, deps = []) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return undefined;
    const run = () => {
      try {
        const p = fnRef.current();
        if (p && typeof p.then === 'function') p.catch(() => undefined);
      } catch {
        /* ignore sync errors */
      }
    };
    run();
    const id = setInterval(run, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps passed explicitly
  }, [intervalMs, enabled, ...deps]);
}
