import { describe, expect, it } from 'vitest';
import { OutboundError, type SafeResponse } from '../../core/outbound.ts';
import type { Fetch } from './fetch.ts';
import { logoDevImage, parseLogoDevKeys, searchLogoDev } from './logo-dev.ts';
import { drawSampleLogo } from './sample-logos.ts';
import { findWebsiteIcon, iconCandidates } from './website-icons.ts';

const PNG = drawSampleLogo([30, 90, 160], 'circle');
const OTHER_PNG = drawSampleLogo([200, 60, 40], 'ring');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

/** A pretend internet: each address answers with what's listed, and anything else fails. */
function fakeFetch(
  answers: Record<string, { body: Buffer | string; type?: string; url?: string }>,
) {
  const asked: { url: string; headers: Record<string, string> | undefined }[] = [];
  const fetch: Fetch = (url, options) => {
    asked.push({ url: url.href, headers: options.headers });
    const answer = answers[url.href];
    if (!answer) return Promise.reject(new OutboundError('It couldn’t be reached.'));
    const body = typeof answer.body === 'string' ? Buffer.from(answer.body) : answer.body;
    if (body.length > options.maxBytes) {
      return Promise.reject(new OutboundError('It sent more than Remidy reads.'));
    }
    const response: SafeResponse = {
      url: new URL(answer.url ?? url.href),
      contentType: answer.type ?? 'application/octet-stream',
      body,
    };
    return Promise.resolve(response);
  };
  return { fetch, asked };
}

const page = new URL('https://bills.example.com/account/login');

describe('a website’s icons', () => {
  it('lists the page’s icons, largest first, then the usual one', () => {
    const html = `<html><head>
      <link rel="icon" href="/small.png" sizes="16x16">
      <link rel="apple-touch-icon" href="https://cdn.example.com/touch.png">
      <link rel='shortcut icon' href='favicon-32.png' sizes='32x32'>
      <link rel="stylesheet" href="/site.css">
    </head><body><link rel="icon" href="/in-body.png"></body></html>`;
    expect(iconCandidates(html, page).map((url) => url.href)).toEqual([
      'https://cdn.example.com/touch.png',
      'https://bills.example.com/account/favicon-32.png',
      'https://bills.example.com/small.png',
      'https://bills.example.com/favicon.ico',
    ]);
  });

  it('leaves out SVG icons, other protocols and broken addresses', () => {
    const html = `<head>
      <link rel="icon" type="image/svg+xml" href="/icon">
      <link rel="icon" href="/logo.svg?v=2">
      <link rel="icon" href="javascript:alert(1)">
      <link rel="icon" href="data:image/png;base64,AAAA">
      <link rel="icon" href="http://[bad">
      <link rel="icon">
    </head>`;
    expect(iconCandidates(html, page).map((url) => url.href)).toEqual([
      'https://bills.example.com/favicon.ico',
    ]);
  });

  it('tries at most 4, and only once each', () => {
    const links = Array.from(
      { length: 6 },
      (_, index) => `<link rel="icon" href="/${String(index)}.png">`,
    );
    const html = `<head>${links.join('')}<link rel="icon" href="/0.png"></head>`;
    expect(iconCandidates(html, page)).toHaveLength(4);
  });

  it('finds the first icon Remidy can keep, from where the page ended up', async () => {
    const { fetch, asked } = fakeFetch({
      [page.href]: {
        body: '<head><link rel="apple-touch-icon" href="touch.svg"><link rel="icon" href="a.png" sizes="64x64"><link rel="icon" href="b.png"></head>',
        type: 'text/html; charset=utf-8',
        url: 'https://www.example.com/home/',
      },
      'https://www.example.com/home/a.png': { body: SVG },
      'https://www.example.com/home/b.png': { body: PNG },
    });
    expect(await findWebsiteIcon(page.href, fetch)).toEqual(PNG);
    expect(asked.map((entry) => entry.url)).toEqual([
      page.href,
      'https://www.example.com/home/a.png',
      'https://www.example.com/home/b.png',
    ]);
  });

  it('falls back to the usual icon when the page can’t be read', async () => {
    const { fetch } = fakeFetch({ 'https://bills.example.com/favicon.ico': { body: PNG } });
    expect(await findWebsiteIcon(page.href, fetch)).toEqual(PNG);
  });

  it('ignores a page that isn’t HTML', async () => {
    const { fetch, asked } = fakeFetch({
      [page.href]: { body: '<link rel="icon" href="/x.png">', type: 'text/plain' },
      'https://bills.example.com/favicon.ico': { body: PNG },
    });
    expect(await findWebsiteIcon(page.href, fetch)).toEqual(PNG);
    expect(asked.map((entry) => entry.url)).not.toContain('https://bills.example.com/x.png');
  });

  it('finds nothing when no icon can be kept', async () => {
    const { fetch } = fakeFetch({ 'https://bills.example.com/favicon.ico': { body: SVG } });
    expect(await findWebsiteIcon(page.href, fetch)).toBeNull();
  });
});

const keys = { publishableKey: 'pk_test1234', secretKey: 'sk_test1234' };

describe('Logo.dev', () => {
  const search = (results: unknown) =>
    fakeFetch({
      'https://api.logo.dev/search?q=City+Power+%26+Light': { body: JSON.stringify(results) },
    });

  it('searches by name with the secret key, and keeps only real domain names', async () => {
    const { fetch, asked } = search([
      { name: 'City Power', domain: 'citypower.example' },
      { name: 'Duplicate', domain: 'CITYPOWER.example' },
      { name: 'Path trick', domain: 'evil.example/../../steal' },
      { name: 'Query trick', domain: 'evil.example?token=x' },
      { name: 'Local', domain: 'localhost' },
      { name: '   ', domain: 'light.example' },
      { domain: 42 },
      'not a result',
    ]);
    expect(await searchLogoDev('City Power & Light', keys, fetch)).toEqual([
      { name: 'City Power', domain: 'citypower.example' },
      { name: 'light.example', domain: 'light.example' },
    ]);
    expect(asked[0]?.headers?.authorization).toBe('Bearer sk_test1234');
  });

  it('offers at most 6', async () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
      name: `Company ${String(index)}`,
      domain: `company${String(index)}.example`,
    }));
    const { fetch } = search(many);
    expect(await searchLogoDev('City Power & Light', keys, fetch)).toHaveLength(6);
  });

  it('finds nothing in an answer that isn’t a list', async () => {
    const { fetch } = search({ error: 'nope' });
    expect(await searchLogoDev('City Power & Light', keys, fetch)).toEqual([]);
  });

  it('fetches an image with the publishable key, never the secret one', async () => {
    const imageUrl =
      'https://img.logo.dev/citypower.example?token=pk_test1234&size=128&format=png&fallback=404';
    const { fetch, asked } = fakeFetch({ [imageUrl]: { body: OTHER_PNG } });
    expect(await logoDevImage('citypower.example', keys, fetch)).toEqual(OTHER_PNG);
    expect(asked[0]?.url).not.toContain('sk_');
  });

  it('keeps no image that isn’t one Remidy keeps', async () => {
    const imageUrl =
      'https://img.logo.dev/citypower.example?token=pk_test1234&size=128&format=png&fallback=404';
    const { fetch } = fakeFetch({ [imageUrl]: { body: SVG } });
    expect(await logoDevImage('citypower.example', keys, fetch)).toBeNull();
  });

  it('keeps no image it can’t use, and never builds an address from a bad domain', async () => {
    const { fetch, asked } = fakeFetch({});
    expect(await logoDevImage('citypower.example', keys, fetch)).toBeNull();
    expect(await logoDevImage('evil.example/../x', keys, fetch)).toBeNull();
    expect(asked).toHaveLength(1);
  });

  it.each([
    [null, null],
    ['not json', null],
    ['"text"', null],
    ['{"publishableKey":"pk_x"}', null],
    [JSON.stringify(keys), keys],
  ])('reads stored keys %s', (stored, expected) => {
    expect(parseLogoDevKeys(stored)).toEqual(expected);
  });
});
