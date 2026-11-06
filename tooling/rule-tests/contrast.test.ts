import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseTokens } from './contrast.ts';

const css = readFileSync(new URL('../../apps/web/src/ui/tokens.css', import.meta.url), 'utf8');
const tokens = parseTokens(css);

const TEXT = 4.5; // WCAG 2.2 SC 1.4.3: normal text
const UI = 3; // WCAG 2.2 SC 1.4.11: controls and meaningful graphics

// Add a pair here whenever a new color combination is used on screen.
const pairs: [foreground: string, background: string, minimum: number][] = [
  ['ink', 'bg', TEXT],
  ['ink', 'surface', TEXT],
  ['ink', 'surface-2', TEXT],
  ['ink', 'accent-soft', TEXT],
  ['ink-2', 'bg', TEXT],
  ['ink-2', 'surface', TEXT],
  ['ink-2', 'surface-2', TEXT],
  ['accent-text', 'bg', TEXT],
  ['accent-text', 'surface', TEXT],
  ['accent-text', 'surface-2', TEXT],
  ['accent-text', 'accent-soft', TEXT],
  ['on-accent', 'accent', TEXT],
  ['paid', 'surface', TEXT],
  ['danger', 'bg', TEXT],
  ['danger', 'surface', TEXT],
  ['danger', 'danger-soft', TEXT],
  ['warn', 'bg', TEXT],
  ['warn', 'surface', TEXT],
  ['warn', 'warn-soft', TEXT],
  ['field', 'surface', UI],
  ['accent', 'surface', UI],
  ['upcoming', 'surface', UI],
];

describe('contrastRatio', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    // The commonly cited borderline gray, just under the 4.5:1 minimum.
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  it('does not depend on argument order', () => {
    expect(contrastRatio('#123456', '#fedcba')).toBe(contrastRatio('#fedcba', '#123456'));
  });
});

describe('parseTokens', () => {
  it('reads values with nested parentheses', () => {
    const parsed = parseTokens('  --a: light-dark(rgb(1 2 3 / 50%), #000000);');
    expect(parsed.get('a')).toEqual({ light: 'rgb(1 2 3 / 50%)', dark: '#000000' });
  });

  it('rejects a token with only one value', () => {
    expect(() => parseTokens('  --a: light-dark(#000000);')).toThrow(/both/);
  });
});

describe('design tokens meet WCAG 2.2 AA', () => {
  it('finds the tokens file contents', () => {
    expect(tokens.size).toBeGreaterThan(10);
  });

  describe.each(['light', 'dark'] as const)('%s theme', (theme) => {
    it.each(pairs)('%s on %s reaches %s:1', (foreground, background, minimum) => {
      const fg = tokens.get(foreground)?.[theme];
      const bg = tokens.get(background)?.[theme];
      if (!fg || !bg) throw new Error(`Unknown token in pair ${foreground} on ${background}`);
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(minimum);
    });
  });
});
