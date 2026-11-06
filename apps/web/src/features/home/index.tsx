import { createRoute } from '@tanstack/react-router';
import { Home } from 'lucide-react';
import { defineFeature } from '../../core/feature.ts';
import { Page } from '../../core/Page.tsx';
import { rootRoute } from '../../core/router.tsx';
import { EmptyState } from '../../ui/index.ts';

function HomePage() {
  return (
    <Page title="Home">
      <EmptyState
        title="Nothing to show yet"
        description="Your bills will appear here once bill tracking is built."
      />
    </Page>
  );
}

export const home = defineFeature({
  name: 'home',
  routes: [createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage })],
  nav: [{ to: '/', label: 'Home', icon: Home }],
});
