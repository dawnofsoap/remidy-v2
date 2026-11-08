import { crc32, deflateSync } from 'node:zlib';

// Logos for the fictional sample companies, drawn here so no real company's logo is ever in the
// repo: a colored rounded square with a simple white shape on it.

export type SampleShape = 'circle' | 'diamond' | 'stripes' | 'ring' | 'bars' | 'drop';

const SIZE = 64;

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, check]);
}

/** A PNG of RGBA pixels, `SIZE` by `SIZE`. */
function encodePng(pixels: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA, no interlacing
  const rows = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    // Each row starts with filter 0, meaning none.
    rows.set(pixels.subarray(y * SIZE * 4, (y + 1) * SIZE * 4), y * (SIZE * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function insideRoundedSquare(x: number, y: number): boolean {
  const radius = 14;
  const nearest = (value: number) => Math.min(Math.max(value, radius), SIZE - 1 - radius);
  return Math.hypot(x - nearest(x), y - nearest(y)) <= radius;
}

function insideShape(shape: SampleShape, x: number, y: number): boolean {
  const middle = (SIZE - 1) / 2;
  const distance = Math.hypot(x - middle, y - middle);
  switch (shape) {
    case 'circle':
      return distance <= 16;
    case 'ring':
      return distance <= 18 && distance >= 10;
    case 'diamond':
      return Math.abs(x - middle) + Math.abs(y - middle) <= 20;
    case 'stripes':
      return y >= 16 && y <= 47 && Math.floor((x + y) / 8) % 2 === 0;
    case 'bars':
      return [18, 30, 42].some(
        (left, index) => x >= left && x < left + 6 && y >= 40 - index * 9 && y <= 46,
      );
    case 'drop':
      return distance <= 12 || (y < middle && Math.abs(x - middle) <= (y - 12) * 0.6 && y >= 12);
  }
}

/** A sample logo: the color as red, green and blue, and a shape. */
export function drawSampleLogo(color: readonly [number, number, number], shape: SampleShape) {
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (!insideRoundedSquare(x, y)) continue;
      const white = insideShape(shape, x, y);
      pixels.set(white ? [255, 255, 255, 255] : [...color, 255], (y * SIZE + x) * 4);
    }
  }
  return encodePng(pixels);
}
