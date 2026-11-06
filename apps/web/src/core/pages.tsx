import { Link } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { cn, EmptyState, focusRing, RadioField } from '../ui/index.ts';
import { readThemePreference, saveThemePreference, type ThemePreference } from './theme.ts';

function Page({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Remidy`;
  }, [title]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}

export function HomePage() {
  return (
    <Page title="Home">
      <EmptyState
        title="Nothing to show yet"
        description="Your bills will appear here once bill tracking is built."
      />
    </Page>
  );
}

const themeOptions = [
  { value: 'system', label: 'Match system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

export function SettingsPage() {
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);

  return (
    <Page title="Settings">
      <RadioField
        label="Appearance"
        value={theme}
        options={themeOptions}
        onChange={(next) => {
          setTheme(next);
          saveThemePreference(next);
        }}
      />
    </Page>
  );
}

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
