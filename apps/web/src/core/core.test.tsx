// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { apiRequest, RequestFailure } from './session.ts';
import { defineFeature, visibleNav, visibleSettings } from './feature.ts';
import { applyTheme, readThemePreference, saveThemePreference } from './theme.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

  it('shows a flagged feature’s settings only once it is enabled', () => {
    const Nothing = () => null;
    const withSettings = [
      defineFeature({
        name: 'plain',
        routes: [],
        nav: [],
        settings: [{ title: 'Plain', component: Nothing }],
      }),
      defineFeature({
        name: 'beta',
        flagged: true,
        routes: [],
        nav: [],
        settings: [{ title: 'Beta', component: Nothing }],
      }),
      defineFeature({ name: 'none', routes: [], nav: [] }),
    ];
    const titles = (enabled: string[]) =>
      visibleSettings(withSettings, enabled).map((section) => section.title);
    expect(titles([])).toEqual(['Plain']);
    expect(titles(['beta'])).toEqual(['Plain', 'Beta']);
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

describe('apiRequest', () => {
  const reply = (status: number, body: unknown) =>
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));

  it('sends JSON and returns the parsed response', async () => {
    const fetch = reply(200, { id: '1', extra: 'dropped' });
    vi.stubGlobal('fetch', fetch);
    const result = await apiRequest('POST', '/api/v1/things', {
      body: { name: 'A' },
      schema: z.object({ id: z.string() }),
    });
    expect(result).toEqual({ id: '1' });
    expect(fetch).toHaveBeenCalledWith('/api/v1/things', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"name":"A"}',
    });
  });

  it('turns an API error into a safe message and field problems', async () => {
    vi.stubGlobal(
      'fetch',
      reply(409, {
        error: {
          code: 'duplicate',
          message: 'Already exists.',
          requestId: 'r',
          fields: [{ path: 'body.name', message: 'Taken.' }],
        },
      }),
    );
    const failure = await apiRequest('POST', '/x', { body: {} }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RequestFailure);
    expect(failure).toMatchObject({
      status: 409,
      message: 'Already exists.',
      fields: { name: 'Taken.' },
    });
  });

  it('gives a general message when the response isn’t an API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('<html>', { status: 502 }))),
    );
    await expect(apiRequest('DELETE', '/x')).rejects.toThrow(/Check your connection/);
  });
});
