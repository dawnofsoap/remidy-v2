// WCAG 2.2 relative luminance and contrast ratio.
// https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`Expected a six-digit hex color, got "${hex}"`);
  }
  const [r, g, b] = [1, 3, 5].map((start) =>
    channel(Number.parseInt(hex.slice(start, start + 2), 16)),
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export interface Token {
  light: string;
  dark: string;
}

/** Reads `--name: light-dark(a, b);` declarations. Values may contain nested parentheses. */
export function parseTokens(css: string): Map<string, Token> {
  const tokens = new Map<string, Token>();
  for (const line of css.split('\n')) {
    const match = /^\s*--([a-z0-9-]+):\s*light-dark\((.+)\);\s*$/.exec(line);
    if (!match) continue;
    const [, name, inner] = match as unknown as [string, string, string];
    let depth = 0;
    let comma = -1;
    for (let i = 0; i < inner.length; i += 1) {
      if (inner[i] === '(') depth += 1;
      if (inner[i] === ')') depth -= 1;
      if (inner[i] === ',' && depth === 0) comma = i;
    }
    if (comma < 0) throw new Error(`--${name} needs both a light and a dark value`);
    tokens.set(name, { light: inner.slice(0, comma).trim(), dark: inner.slice(comma + 1).trim() });
  }
  return tokens;
}
