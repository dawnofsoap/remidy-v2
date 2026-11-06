// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { defineFeature, visibleNav } from './feature.ts';
import { applyTheme, readThemePreference, saveThemePreference } from './theme.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  function Broken(): never {
    throw new Error('secret internal detail');
  }

  it('shows a recovery message without technical details', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.queryByText(/secret internal detail/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows the page when nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>Working</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Working')).toBeInTheDocument();
  });
});

describe('navigation', () => {
  const item = (label: string) => ({ to: `/${label}`, label, icon: (() => null) as never });
  const features = [
    defineFeature({ name: 'always', routes: [], nav: [item('always')] }),
    defineFeature({ name: 'beta', flagged: true, routes: [], nav: [item('beta')] }),
  ];
  const labels = (enabled: string[]) => visibleNav(features, enabled).map((nav) => nav.label);

  it('hides a flagged feature until it is enabled', () => {
    expect(labels([])).toEqual(['always']);
    expect(labels(['beta'])).toEqual(['always', 'beta']);
  });

  it('ignores enabled names it does not know', () => {
    expect(labels(['other'])).toEqual(['always']);
  });
});

describe('theme preference', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('defaults to following the system', () => {
    expect(readThemePreference()).toBe('system');
  });

  it('remembers a choice and applies it', () => {
    saveThemePreference('dark');
    expect(readThemePreference()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('removes the override when set back to system', () => {
    applyTheme('light');
    saveThemePreference('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('ignores an unknown stored value', () => {
    localStorage.setItem('remidy.theme', 'neon');
    expect(readThemePreference()).toBe('system');
  });

  it('still works when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readThemePreference()).toBe('system');
    expect(() => {
      saveThemePreference('dark');
    }).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
