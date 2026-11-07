import { cn, focusRing } from '../ui/index.ts';

// The router marks the current page's link with data-status="active".
export const activeLink =
  'data-[status=active]:bg-accent-soft data-[status=active]:font-semibold data-[status=active]:text-accent-text';

/** A link in a vertical list of places, such as the sidebar or a settings area. */
export const listLink = cn(
  'flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium text-ink-2',
  activeLink,
  focusRing,
);
