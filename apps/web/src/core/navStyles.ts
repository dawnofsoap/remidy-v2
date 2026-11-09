import { cn, focusRing } from '../ui/index.ts';

// The router marks the current page's link with data-status="active".
export const activeLink =
  'data-[status=active]:bg-accent-soft data-[status=active]:font-semibold data-[status=active]:text-accent-text';

/** A link in a vertical list of places, such as the sidebar or a settings area. */
export const listLink = cn(
  'flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium text-ink-2',
  // Pointing at one shows it can be chosen.
  'hover:bg-surface-2 hover:text-ink',
  activeLink,
  focusRing,
);

/**
 * On phones, a list of places looks like the app's other lists: rows in a card, each with a
 * chevron. Wider screens keep the plain list beside the content.
 */
export const placeList =
  'flex flex-col max-md:divide-y max-md:divide-line max-md:overflow-hidden max-md:rounded-2xl max-md:border max-md:border-line max-md:bg-surface md:gap-1';
export const placeLink = cn(
  listLink,
  'max-md:min-h-14 max-md:rounded-none max-md:px-4 max-md:font-semibold max-md:text-ink max-md:-outline-offset-2',
);
