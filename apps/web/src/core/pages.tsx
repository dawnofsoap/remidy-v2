import { Link } from '@tanstack/react-router';
import { cn, focusRing } from '../ui/index.ts';
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
