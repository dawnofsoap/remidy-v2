import { createRoute } from '@tanstack/react-router';
import { Home } from 'lucide-react';
import { useHomeSections } from '../../core/AppLayout.tsx';
import { defineFeature } from '../../core/feature.ts';
import { Page } from '../../core/Page.tsx';
import { rootRoute } from '../../core/router.tsx';
import { EmptyState } from '../../ui/index.ts';

function HomePage() {
  const sections = useHomeSections();
  return (
    <Page title="Home">
      {sections.length === 0 ? (
        <EmptyState
          title="Nothing to show yet"
          description="Your bills will appear here once bill tracking is built."
        />
      ) : (
        sections.map((Section, index) => <Section key={index} />)
      )}
    </Page>
  );
}

export const home = defineFeature({
  name: 'home',
  routes: [createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage })],
  nav: [{ to: '/', label: 'Home', icon: Home }],
});
