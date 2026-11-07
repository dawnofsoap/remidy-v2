import { createRoute } from '@tanstack/react-router';
import { useSpaceSettingsSections } from '../../core/AppLayout.tsx';
import { defineFeature } from '../../core/feature.ts';
import { useAddressPart } from '../../core/params.ts';
import { NotFoundPage } from '../../core/pages.tsx';
import { rootRoute } from '../../core/router.tsx';
import { SettingsArea } from '../../core/SettingsArea.tsx';
import { canManage, useSpaceFromAddress } from '../../core/space.tsx';
import { ErrorState, LoadingState } from '../../ui/index.ts';
import { GeneralSection } from './GeneralSection.tsx';

/** Settings a space's members share. Other features add their own sections here. */
function SpaceSettingsPage() {
  const section = useAddressPart('section');
  const added = useSpaceSettingsSections();
  const { space, isPending, isError, refetch } = useSpaceFromAddress();

  if (isPending) return <LoadingState label="Loading space settings" />;
  if (isError) return <ErrorState message="Space settings couldn’t load." onRetry={refetch} />;
  // Someone outside the space can't tell it exists.
  if (!space) return <NotFoundPage />;

  return (
    <SettingsArea
      title="Space settings"
      subtitle={`${space.name}${canManage(space) ? '' : ' · Only managers and owners can change these.'}`}
      basePath={`/spaces/${space.id}/settings`}
      sections={[{ slug: 'general', title: 'General', component: GeneralSection }, ...added]}
      section={section}
    />
  );
}

export const spaceSettings = defineFeature({
  name: 'space-settings',
  routes: [
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/spaces/$spaceId/settings',
      component: SpaceSettingsPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/spaces/$spaceId/settings/$section',
      component: SpaceSettingsPage,
    }),
  ],
  nav: [],
});
