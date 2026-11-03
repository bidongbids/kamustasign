// A value written many times a second from outside React (a camera frame
// loop) that only the components which draw it should re-render for. The
// Translator's hold ring follows every frame this way while the rest of the
// screen updates at most 10 times a second.
import { useSyncExternalStore } from "react";

export type LiveValue<T> = {
  get: () => T;
  set: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createLiveValue<T>(initial: T): LiveValue<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useLiveValue<T>(store: LiveValue<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
