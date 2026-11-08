/**
 * Which images Remidy keeps, decided from a file's first bytes. The type a website or browser
 * claims is never trusted, and SVG is never accepted, because it can carry scripts.
 */
export type ImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/x-icon';

export const IMAGE_TYPES: readonly ImageType[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/x-icon',
];

/** The largest logo kept, whether uploaded or fetched. */
export const LOGO_MAX_BYTES = 256 * 1024;

const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0) =>
  bytes.length >= at + signature.length &&
  signature.every((byte, index) => bytes[at + index] === byte);

const ascii = (text: string) => [...new TextEncoder().encode(text)];

/** The image's type, or null when it isn't one Remidy keeps. */
export function imageTypeOf(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) return 'image/gif';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  // An icon file: reserved 0, type 1, and at least one image in it.
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00]) && bytes.length >= 6) {
    const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(4, true);
    if (count > 0) return 'image/x-icon';
  }
  return null;
}

/** Why an image can't be kept, in words for the person, or null when it can. */
export function logoProblem(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return 'That file is empty.';
  if (bytes.length > LOGO_MAX_BYTES) return 'Use an image of 256 KB or less.';
  if (!imageTypeOf(bytes)) return 'Use a PNG, JPEG, GIF, WebP or ICO image.';
  return null;
}
