import { createRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { defineFeature, type SettingsSection } from '../../core/feature.ts';
import { useAddressPart } from '../../core/params.ts';
import { rootRoute } from '../../core/router.tsx';
import { SettingsArea } from '../../core/SettingsArea.tsx';
import {
  readThemePreference,
  saveThemePreference,
  type ThemePreference,
} from '../../core/theme.ts';
import { RadioField } from '../../ui/index.ts';
import { ProfileSection, SecuritySection } from './AccountSettings.tsx';

const themeOptions = [
  { value: 'system', label: 'Match system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

function AppearanceSection() {
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  return (
    <RadioField
      label="Theme"
      value={theme}
      options={themeOptions}
      onChange={(next) => {
        setTheme(next);
        saveThemePreference(next);
      }}
    />
  );
}

/** Settings that are only about the person signed in. Shared ones are in Space settings. */
const sections: SettingsSection[] = [
  { slug: 'profile', title: 'Profile', component: ProfileSection },
  { slug: 'appearance', title: 'Appearance', component: AppearanceSection },
  { slug: 'security', title: 'Security', component: SecuritySection },
];

function SettingsPage() {
  const section = useAddressPart('section');
  return (
    <SettingsArea title="Settings" basePath="/settings" sections={sections} section={section} />
  );
}

export const settings = defineFeature({
  name: 'settings',
  routes: [
    createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/settings/$section',
      component: SettingsPage,
    }),
  ],
  nav: [],
});
