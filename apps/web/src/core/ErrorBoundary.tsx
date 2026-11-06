import { Component, type ReactNode } from 'react';
import { ErrorState } from '../ui/index.ts';

function reload() {
  window.location.reload();
}

/** What a person sees when a page fails, with no technical details exposed. */
export function PageError() {
  return (
    <ErrorState message="Something went wrong. Reload the page and try again." onRetry={reload} />
  );
}

/** The last line of defense, so a rendering failure never leaves a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? <PageError /> : this.props.children;
  }
}
