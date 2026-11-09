import { useSyncExternalStore } from 'react';

// The same width at which Modal becomes a bottom sheet (Tailwind's `sm`).
const PHONE = '(max-width: 639px)';
// Below Tailwind's `md`, where wide layouts such as the calendar's month grid don't fit.
const NARROW = '(max-width: 767px)';

const query = (media: string) =>
  typeof window.matchMedia === 'function' ? window.matchMedia(media) : null;

function useMedia(media: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = query(media);
      list?.addEventListener('change', onChange);
      return () => {
        list?.removeEventListener('change', onChange);
      };
    },
    () => query(media)?.matches ?? false,
  );
}

/** For behavior that has to differ on phones. Layout that can should use responsive classes. */
export function useIsPhone(): boolean {
  return useMedia(PHONE);
}

/** For behavior that has to differ below `md`, matching layout that switches there. */
export function useIsNarrow(): boolean {
  return useMedia(NARROW);
}
