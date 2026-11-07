import { useSyncExternalStore } from 'react';

// The same width at which Modal becomes a bottom sheet (Tailwind's `sm`).
const PHONE = '(max-width: 639px)';

const query = () => (typeof window.matchMedia === 'function' ? window.matchMedia(PHONE) : null);

function subscribe(onChange: () => void): () => void {
  const list = query();
  list?.addEventListener('change', onChange);
  return () => {
    list?.removeEventListener('change', onChange);
  };
}

/** For behavior that has to differ on phones. Layout that can should use responsive classes. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => query()?.matches ?? false);
}
