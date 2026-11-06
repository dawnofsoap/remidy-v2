import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { AppLayout } from './AppLayout.tsx';
import { PageError } from './ErrorBoundary.tsx';
import { HomePage, NotFoundPage, SettingsPage } from './pages.tsx';

const rootRoute = createRootRoute({ component: AppLayout });

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage }),
]);

export const router = createRouter({
  routeTree,
  defaultErrorComponent: PageError,
  defaultNotFoundComponent: NotFoundPage,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
