import { useEffect, useState } from 'react';

/**
 * Subscribes to a real-time backend stream. `subscribe(cb)` must return an unsubscribe function.
 * Pass `null` as subscribe to pause. Returns `{ data, loading }`.
 * Includes a mobile safety timeout so a slow/blocked listener never leaves the UI stuck in loading.
 */
export function useSubscription(subscribe, deps) {
  const [state, setState] = useState({ data: null, loading: Boolean(subscribe) });

  useEffect(() => {
    if (!subscribe) {
      setState({ data: null, loading: false });
      return;
    }
    let settled = false;
    setState((s) => ({ data: s.data, loading: s.data === null }));
    const timer = setTimeout(() => {
      if (!settled) setState((s) => ({ data: s.data ?? [], loading: false }));
    }, 4000);
    const unsub = subscribe((data) => {
      settled = true;
      clearTimeout(timer);
      setState({ data, loading: false });
    });
    return () => {
      clearTimeout(timer);
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
