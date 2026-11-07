import { createRoute } from '@tanstack/react-router';
import { useIsInstanceAdmin } from '../../core/areas.ts';
import { defineFeature, type SettingsSection } from '../../core/feature.ts';
import { useAddressPart } from '../../core/params.ts';
import { NotFoundPage } from '../../core/pages.tsx';
import { rootRoute } from '../../core/router.tsx';
import { SettingsArea } from '../../core/SettingsArea.tsx';
import { JobStatus } from './JobStatus.tsx';

/** For whoever runs this copy of Remidy. It grants no access to anyone's bills. */
const sections: SettingsSection[] = [
  { slug: 'jobs', title: 'Background jobs', component: JobStatus },
];

function AdminPage() {
  const section = useAddressPart('section');
  // The server refuses these to anyone else too. This keeps the page from existing for them.
  if (!useIsInstanceAdmin()) return <NotFoundPage />;
  return (
    <SettingsArea title="Administration" basePath="/admin" sections={sections} section={section} />
  );
}

export const admin = defineFeature({
  name: 'admin',
  routes: [
    createRoute({ getParentRoute: () => rootRoute, path: '/admin', component: AdminPage }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/$section', component: AdminPage }),
  ],
  nav: [],
});
