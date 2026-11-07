import { createRoute } from '@tanstack/react-router';
import { useSpaceSettingsSections } from '../../core/AppLayout.tsx';
import { defineFeature } from '../../core/feature.ts';
import { useAddressPart } from '../../core/params.ts';
import { NotFoundPage } from '../../core/pages.tsx';
import { rootRoute } from '../../core/router.tsx';
import { SettingsArea } from '../../core/SettingsArea.tsx';
import { canManage, SettingsSpaceProvider, useHousehold, useSpaces } from '../../core/space.tsx';
import { ErrorState, LoadingState } from '../../ui/index.ts';
import { TimeZoneSection } from '../../core/TimeZoneSection.tsx';

/** What a household shares. Members and invitations arrive with sharing. */
function HouseholdPage() {
  const section = useAddressPart('section');
  const added = useSpaceSettingsSections();
  const spaces = useSpaces();
  const household = useHousehold();

  if (spaces.isPending) return <LoadingState label="Loading household" />;
  if (spaces.isError) {
    return <ErrorState message="Household couldn’t load." onRetry={() => void spaces.refetch()} />;
  }
  // Without one, the page doesn't exist.
  if (!household) return <NotFoundPage />;

  return (
    <SettingsSpaceProvider value={household}>
      <SettingsArea
        title="Household"
        subtitle={`${household.name}${canManage(household) ? '' : ' · Only managers and owners can change these.'}`}
        basePath="/household"
        sections={[{ slug: 'time-zone', title: 'Time zone', component: TimeZoneSection }, ...added]}
        section={section}
      />
    </SettingsSpaceProvider>
  );
}

export const household = defineFeature({
  name: 'household',
  routes: [
    createRoute({ getParentRoute: () => rootRoute, path: '/household', component: HouseholdPage }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/household/$section',
      component: HouseholdPage,
    }),
  ],
  nav: [],
});
