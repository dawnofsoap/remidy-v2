import { createRoute } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { useState } from 'react';
import { useSettingsSections } from '../../core/AppLayout.tsx';
import { defineFeature } from '../../core/feature.ts';
import { Page } from '../../core/Page.tsx';
import { rootRoute } from '../../core/router.tsx';
import {
  readThemePreference,
  saveThemePreference,
  type ThemePreference,
} from '../../core/theme.ts';
import { RadioField } from '../../ui/index.ts';
import { AccountSettings } from './AccountSettings.tsx';

const themeOptions = [
  { value: 'system', label: 'Match system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

function SettingsPage() {
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const sections = useSettingsSections();

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
      <AccountSettings />
      {sections.map(({ title, component: Section }) => (
        <section key={title} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Section />
        </section>
      ))}
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
