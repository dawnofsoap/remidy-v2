import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { Home, Settings, type LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn, focusRing, Toaster } from '../ui/index.ts';
import { ServerStatus } from './ServerStatus.tsx';

// The router marks the current page's link with data-status="active".
const activeLink =
  'data-[status=active]:bg-accent-soft data-[status=active]:font-semibold data-[status=active]:text-accent-text';

const navItems: { to: '/' | '/settings'; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Sidebar() {
  return (
    <nav
      aria-label="Main"
      className="hidden w-58 flex-none flex-col gap-6 border-r border-line bg-surface p-4 md:flex"
    >
      <p className="px-2 text-xl font-bold tracking-tight">Remidy</p>
      <ul className="flex flex-col gap-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium text-ink-2',
                activeLink,
                focusRing,
              )}
            >
              <Icon aria-hidden="true" className="size-5" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 border-t border-line bg-surface p-2 md:hidden"
    >
      <ul className="grid auto-cols-fr grid-flow-col gap-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className={cn(
                'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-medium text-ink-2',
                activeLink,
                focusRing,
              )}
            >
              <Icon aria-hidden="true" className="size-5" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function AppLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const mainRef = useRef<HTMLElement>(null);
  const previousPathname = useRef(pathname);

  // After navigating, keyboard and screen reader users continue from the new page's content.
  useEffect(() => {
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;
      mainRef.current?.focus();
    }
  }, [pathname]);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className={cn(
          'absolute top-2 left-2 z-10 -translate-y-20 rounded-xl bg-surface p-3 font-semibold focus:translate-y-0',
          focusRing,
        )}
      >
        Skip to content
      </a>
      <Sidebar />
      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className="min-w-0 flex-auto p-4 pb-24 outline-none md:p-8"
      >
        <div className="mx-auto max-w-5xl">
          <ServerStatus />
          <Outlet />
        </div>
      </main>
      <BottomNav />
      <Toaster />
    </div>
  );
}
