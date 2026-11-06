import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './core/ErrorBoundary.tsx';
import { router } from './core/router.tsx';
import { applyTheme, readThemePreference } from './core/theme.ts';
import './index.css';

applyTheme(readThemePreference());

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const queryClient = new QueryClient();

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
