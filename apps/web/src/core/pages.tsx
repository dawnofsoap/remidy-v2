import { Link, useNavigate } from '@tanstack/react-router';
import { cn, focusRing, List, ListRow } from '../ui/index.ts';
import { useAreaLinks } from './areas.ts';
import { Page } from './Page.tsx';

export function NotFoundPage() {
  return (
    <Page title="Page not found">
      <p className="text-ink-2">This page doesn’t exist or may have moved.</p>
      <Link to="/" className={cn('self-start rounded font-semibold underline', focusRing)}>
        Go to Home
      </Link>
    </Page>
  );
}

/** On phones, where the settings areas live, since the tab bar has room only for the main pages. */
export function MorePage() {
  const navigate = useNavigate();
  const areas = useAreaLinks();
  return (
    <Page title="More">
      <List label="More">
        {areas.map(({ to, label, icon: Icon }) => (
          <ListRow
            key={to}
            title={label === 'Space' ? 'Space settings' : label}
            start={<Icon aria-hidden="true" className="size-5 text-ink-2" />}
            onClick={() => void navigate({ to })}
          />
        ))}
      </List>
    </Page>
  );
}
