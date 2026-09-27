/**
 * Framework free observable store.
 *
 * React only subscribes through `useStore()`; the domain never imports React (spec §3).
 */

export type Listener = () => void;

export interface Store<T> {
  getState(): T;
  setState(updater: T | ((prev: T) => T)): void;
  /** subscriber may push mutators that run batched at the end of the current tick */
  subscribe(listener: Listener): () => void;
  /** escape hatch for `useSyncExternalStore` */
  getVersion(): number;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  let version = 0;
  const listeners = new Set<Listener>();

  const notify = () => {
    version += 1;
    for (const listener of listeners) listener();
  };

  return {
    getState: () => state,
    setState(updater) {
      const next = typeof updater === 'function' ? (updater as (prev: T) => T)(state) : updater;
      if (next === state) return;
      state = next;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion: () => version,
  };
}
