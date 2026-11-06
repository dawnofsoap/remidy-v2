import { createRoute } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { useState } from 'react';
import { defineFeature } from '../../core/feature.ts';
import { Page } from '../../core/Page.tsx';
import { rootRoute } from '../../core/router.tsx';
import {
  readThemePreference,
  saveThemePreference,
  type ThemePreference,
} from '../../core/theme.ts';
import { RadioField } from '../../ui/index.ts';

const themeOptions = [
  { value: 'system', label: 'Match system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

function SettingsPage() {
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

export const settings = defineFeature({
  name: 'settings',
  routes: [
    createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage }),
  ],
  nav: [{ to: '/settings', label: 'Settings', icon: Settings }],
});
