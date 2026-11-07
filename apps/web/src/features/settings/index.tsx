import { createRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useSpaceSettingsSections } from '../../core/AppLayout.tsx';
import { defineFeature, type SettingsSection } from '../../core/feature.ts';
import { useAddressPart } from '../../core/params.ts';
import { rootRoute } from '../../core/router.tsx';
import { SettingsArea } from '../../core/SettingsArea.tsx';
import {
  readThemePreference,
  saveThemePreference,
  type ThemePreference,
} from '../../core/theme.ts';
import {
  SettingsSpaceProvider,
  useHousehold,
  usePersonalSpace,
  useSpaces,
} from '../../core/space.tsx';
import { TimeZoneSection } from '../../core/TimeZoneSection.tsx';
import { ErrorState, LoadingState, RadioField } from '../../ui/index.ts';
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

const start: SettingsSection[] = [
  { slug: 'profile', title: 'Profile', component: ProfileSection },
  { slug: 'appearance', title: 'Appearance', component: AppearanceSection },
  { slug: 'time-zone', title: 'Time zone', component: TimeZoneSection },
];
const end: SettingsSection[] = [
  { slug: 'security', title: 'Security', component: SecuritySection },
];

/**
 * Settings that are only about the person signed in, including their personal space. Shared lists
 * such as categories are here only for someone without a household, whose lists are their own.
 */
function SettingsPage() {
  const section = useAddressPart('section');
  const added = useSpaceSettingsSections();
  const spaces = useSpaces();
  const personal = usePersonalSpace();
  const household = useHousehold();

  if (spaces.isPending) return <LoadingState label="Loading settings" />;
  if (spaces.isError || !personal) {
    return <ErrorState message="Settings couldn’t load." onRetry={() => void spaces.refetch()} />;
  }

  return (
    <SettingsSpaceProvider value={personal}>
      <SettingsArea
        title="Settings"
        basePath="/settings"
        sections={[...start, ...(household ? [] : added), ...end]}
        section={section}
      />
    </SettingsSpaceProvider>
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
