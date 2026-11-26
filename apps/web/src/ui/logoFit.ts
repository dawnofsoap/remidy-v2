/**
 * Many logos come as a mark on their own solid square, often white, with a wide margin. Drawn in a
 * tile, that makes a box inside a box with the mark shrunk in the middle. This finds that
 * background and the square around the mark, so the tile can take the background's color and show
 * the mark at full size.
 */
export interface LogoFit {
  /** The logo's own background, as a CSS color. */
  background: string;
  /** The square around the mark, in the image's pixels. It may reach past the image's edges. */
  square: { x: number; y: number; size: number };
}

/** How far a corner may be from the others and still be the same background. */
const CORNER_TOLERANCE = 24;
/** How far a pixel must be from the background to count as part of the mark. */
const MARK_THRESHOLD = 40;

const distance = (pixels: Uint8ClampedArray, at: number, color: number[]) =>
  Math.max(
    Math.abs((pixels[at] ?? 0) - (color[0] ?? 0)),
    Math.abs((pixels[at + 1] ?? 0) - (color[1] ?? 0)),
    Math.abs((pixels[at + 2] ?? 0) - (color[2] ?? 0)),
  );

/**
 * The fit for a logo's RGBA pixels, or null when it has no solid background of its own, such as
 * one drawn on transparency. Those are shown as they are.
 */
export function fitLogo(pixels: Uint8ClampedArray, width: number, height: number): LogoFit | null {
  if (width === 0 || height === 0) return null;
  const corners = [0, width - 1, (height - 1) * width, height * width - 1].map(
    (index) => index * 4,
  );
  if (corners.some((at) => (pixels[at + 3] ?? 0) < 250)) return null;
  const background = [0, 1, 2].map((channel) =>
    Math.round(corners.reduce((sum, at) => sum + (pixels[at + channel] ?? 0), 0) / 4),
  );
  if (corners.some((at) => distance(pixels, at, background) > CORNER_TOLERANCE)) return null;

  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      if ((pixels[at + 3] ?? 0) < 16 || distance(pixels, at, background) <= MARK_THRESHOLD)
        continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  const color = `rgb(${background.join(' ')})`;
  if (right < 0)
    return { background: color, square: { x: 0, y: 0, size: Math.max(width, height) } };
  const size = Math.max(right - left + 1, bottom - top + 1);
  return {
    background: color,
    square: {
      x: Math.round((left + right + 1 - size) / 2),
      y: Math.round((top + bottom + 1 - size) / 2),
      size,
    },
  };
}

/** Largest side the image is read at. Plenty to find the mark, and quick. */
const READ_SIZE = 256;

const fits = new Map<string, Promise<{ src: string; background: string } | null>>();

/**
 * The logo redrawn as just its mark on its own background, as a data URL, or null to show it as
 * it is. Done once per address. A logo from another site can't be read, so it's shown as it is.
 */
export function fittedLogo(src: string): Promise<{ src: string; background: string } | null> {
  const known = fits.get(src);
  if (known) return known;
  const made = new Promise<{ src: string; background: string } | null>((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onerror = () => {
      resolve(null);
    };
    image.onload = () => {
      try {
        const scale = Math.min(1, READ_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const reading = document.createElement('canvas');
        reading.width = width;
        reading.height = height;
        const context = reading.getContext('2d', { willReadFrequently: true });
        if (!context) {
          resolve(null);
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        const fit = fitLogo(context.getImageData(0, 0, width, height).data, width, height);
        if (!fit) {
          resolve(null);
          return;
        }
        const { x, y, size } = fit.square;
        const out = document.createElement('canvas');
        out.width = size;
        out.height = size;
        const drawing = out.getContext('2d');
        if (!drawing) {
          resolve(null);
          return;
        }
        drawing.fillStyle = fit.background;
        drawing.fillRect(0, 0, size, size);
        drawing.drawImage(reading, -x, -y);
        resolve({ src: out.toDataURL('image/png'), background: fit.background });
      } catch {
        // Another site's image can't be read back.
        resolve(null);
      }
    };
    image.src = src;
  });
  fits.set(src, made);
  return made;
}
