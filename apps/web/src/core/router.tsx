import { createRootRoute, createRouter, type AnyRoute } from '@tanstack/react-router';
import { AppLayout } from './AppLayout.tsx';
import { PageError } from './ErrorBoundary.tsx';
import { NotFoundPage } from './pages.tsx';

/** The parent of every page. Features attach their routes to it. */
export const rootRoute = createRootRoute({ component: AppLayout });

export function createAppRouter(routes: AnyRoute[]) {
  return createRouter({
    routeTree: rootRoute.addChildren(routes),
    defaultErrorComponent: PageError,
    defaultNotFoundComponent: NotFoundPage,
  });
}
