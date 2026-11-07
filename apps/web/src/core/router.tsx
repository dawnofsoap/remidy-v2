import { createRootRoute, createRoute, createRouter, type AnyRoute } from '@tanstack/react-router';
import { AppLayout } from './AppLayout.tsx';
import { PageError } from './ErrorBoundary.tsx';
import { MorePage, NotFoundPage } from './pages.tsx';

/** The parent of every page. Features attach their routes to it. */
export const rootRoute = createRootRoute({ component: AppLayout });

const moreRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/more',
  component: MorePage,
});

export function createAppRouter(routes: AnyRoute[]) {
  return createRouter({
    routeTree: rootRoute.addChildren([moreRoute, ...routes]),
    defaultErrorComponent: PageError,
    defaultNotFoundComponent: NotFoundPage,
  });
}
