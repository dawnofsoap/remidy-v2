import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { imageTypeOf, LOGO_MAX_BYTES, logoProblem } from './images.ts';

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => [...new TextEncoder().encode(value)];
const padded = (start: number[], length = 64) =>
  new Uint8Array([...start, ...new Array<number>(Math.max(0, length - start.length)).fill(0)]);

describe('image types', () => {
  it.each([
    ['PNG', padded([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'],
    ['JPEG', padded([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'],
    ['GIF 87a', padded(text('GIF87a')), 'image/gif'],
    ['GIF 89a', padded(text('GIF89a')), 'image/gif'],
    ['WebP', padded([...text('RIFF'), 0, 0, 0, 0, ...text('WEBP')]), 'image/webp'],
    ['ICO', padded([0, 0, 1, 0, 1, 0]), 'image/x-icon'],
  ])('reads %s from its bytes', (_name, image, type) => {
    expect(imageTypeOf(image)).toBe(type);
  });

  it.each([
    ['SVG', padded(text('<svg xmlns="http://www.w3.org/2000/svg">'))],
    ['SVG with an XML header', padded(text('<?xml version="1.0"?><svg>'))],
    ['HTML', padded(text('<!DOCTYPE html><script>alert(1)</script>'))],
    ['a RIFF file that isn’t WebP', padded([...text('RIFF'), 0, 0, 0, 0, ...text('WAVE')])],
    ['a cursor file', padded([0, 0, 2, 0, 1, 0])],
    ['an icon file with no images', padded([0, 0, 1, 0, 0, 0])],
    ['a cut-off PNG signature', bytes(0x89, 0x50, 0x4e)],
    ['a cut-off icon header', bytes(0, 0, 1, 0)],
    ['nothing', bytes()],
  ])('refuses %s', (_name, file) => {
    expect(imageTypeOf(file)).toBeNull();
  });

  it('never accepts a file that starts with text', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (value) => {
        const file = new TextEncoder().encode(`<${value}`);
        expect(imageTypeOf(file)).toBeNull();
      }),
    );
  });
});

describe('logo problems', () => {
  const png = padded([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it('accepts an image up to the limit', () => {
    expect(logoProblem(png)).toBeNull();
    expect(logoProblem(padded([...png], LOGO_MAX_BYTES))).toBeNull();
  });

  it('refuses an image over the limit', () => {
    expect(logoProblem(padded([...png], LOGO_MAX_BYTES + 1))).toMatch(/256 KB/);
  });

  it('refuses an empty file and one of another type', () => {
    expect(logoProblem(bytes())).toMatch(/empty/);
    expect(logoProblem(padded(text('<svg>')))).toMatch(/PNG, JPEG/);
  });
});
