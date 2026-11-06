import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FeaturesProvider } from './core/AppLayout.tsx';
import { ErrorBoundary } from './core/ErrorBoundary.tsx';
import { createAppRouter } from './core/router.tsx';
import { applyTheme, readThemePreference } from './core/theme.ts';
import { features } from './features/index.ts';
import './index.css';

applyTheme(readThemePreference());

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const queryClient = new QueryClient();
const router = createAppRouter(features.flatMap((feature) => feature.routes));

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <FeaturesProvider value={features}>
          <RouterProvider router={router} />
        </FeaturesProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
