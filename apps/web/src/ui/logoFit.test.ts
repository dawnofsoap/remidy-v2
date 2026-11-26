import { describe, expect, it } from 'vitest';
import { fitLogo } from './logoFit.ts';

type Color = [number, number, number, number];
const WHITE: Color = [255, 255, 255, 255];
const BLUE: Color = [0, 80, 200, 255];
const CLEAR: Color = [0, 0, 0, 0];

/** A width × height image of one color, with a rectangle of another. */
function image(
  width: number,
  height: number,
  background: Color,
  mark?: { x: number; y: number; width: number; height: number; color: Color },
) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inMark =
        mark && x >= mark.x && x < mark.x + mark.width && y >= mark.y && y < mark.y + mark.height;
      pixels.set(inMark ? mark.color : background, (y * width + x) * 4);
    }
  }
  return pixels;
}

describe('fitting a logo to its tile', () => {
  it('finds a white square and the mark inside it', () => {
    const pixels = image(100, 100, WHITE, { x: 30, y: 40, width: 40, height: 20, color: BLUE });
    expect(fitLogo(pixels, 100, 100)).toEqual({
      background: 'rgb(255 255 255)',
      // Square, centered on the mark, as wide as its longer side.
      square: { x: 30, y: 30, size: 40 },
    });
  });

  it('takes a colored square too', () => {
    const pixels = image(10, 10, BLUE, { x: 2, y: 2, width: 6, height: 6, color: WHITE });
    expect(fitLogo(pixels, 10, 10)?.background).toBe('rgb(0 80 200)');
  });

  it('leaves a logo drawn on transparency as it is', () => {
    const pixels = image(10, 10, CLEAR, { x: 2, y: 2, width: 6, height: 6, color: BLUE });
    expect(fitLogo(pixels, 10, 10)).toBeNull();
  });

  it('leaves a logo whose corners differ as it is, since it has no single background', () => {
    const pixels = image(10, 10, WHITE, { x: 0, y: 0, width: 5, height: 5, color: BLUE });
    expect(fitLogo(pixels, 10, 10)).toBeNull();
  });

  it('keeps a plain square whole, and an empty image is left alone', () => {
    expect(fitLogo(image(8, 6, WHITE), 8, 6)?.square).toEqual({ x: 0, y: 0, size: 8 });
    expect(fitLogo(new Uint8ClampedArray(0), 0, 0)).toBeNull();
  });
});
