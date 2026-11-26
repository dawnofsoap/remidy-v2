import { useEffect, useState } from 'react';
import { cn } from './cn.ts';
import { fittedLogo } from './logoFit.ts';

const SIZES = {
  small: 'size-6 rounded-md text-[0.625rem]',
  medium: 'size-9 rounded-lg text-xs',
  large: 'size-12 rounded-xl text-sm',
} as const;

/** Up to two letters from a name, such as "CP" for "City Power & Light". */
export function initialsOf(name: string): string {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

interface LogoTileProps {
  /** The logo's address, or null for a lettered tile. */
  src: string | null;
  /** What the logo belongs to. Shown beside it, so the tile itself is hidden from screen readers. */
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}

/** The logo as just its mark on its own background, once that's been worked out. */
function useFitted(src: string | null) {
  const [fit, setFit] = useState<{ for: string; src: string; background: string } | null>(null);
  useEffect(() => {
    if (src === null) return;
    let current = true;
    void fittedLogo(src).then((found) => {
      if (current && found) setFit({ for: src, ...found });
    });
    return () => {
      current = false;
    };
  }, [src]);
  return fit?.for === src ? fit : null;
}

/**
 * A company's logo, or its initials when there's none or it won't load. Always the same size, so
 * names beside it line up. A logo on its own solid square, often white, is trimmed to its mark and
 * the tile takes that square's color, so it isn't a small box inside the tile.
 */
export function LogoTile({ src, name, size = 'medium', className }: LogoTileProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const fitted = useFitted(src);
  const showImage = src !== null && failed !== src;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex flex-none items-center justify-center overflow-hidden font-semibold',
        showImage ? 'border border-line bg-logo-backdrop' : 'bg-surface-2 text-ink-2',
        SIZES[size],
        className,
      )}
      style={showImage && fitted ? { backgroundColor: fitted.background } : undefined}
    >
      {showImage ? (
        <img
          src={fitted?.src ?? src}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-contain p-[12%]"
          onError={() => {
            setFailed(src);
          }}
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
