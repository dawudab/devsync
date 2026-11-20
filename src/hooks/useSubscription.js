import { useEffect, useState } from 'react';

/**
 * Subscribes to a real-time backend stream. `subscribe(cb)` must return an unsubscribe function.
 * Pass `null` as subscribe to pause. Returns `{ data, loading }`.
 */
export function useSubscription(subscribe, deps) {
  const [state, setState] = useState({ data: null, loading: Boolean(subscribe) });

  useEffect(() => {
    if (!subscribe) {
      setState({ data: null, loading: false });
      return;
    }
    setState((s) => ({ data: s.data, loading: true }));
    return subscribe((data) => setState({ data, loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
