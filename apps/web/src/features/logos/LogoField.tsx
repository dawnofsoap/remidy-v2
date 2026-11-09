import type { LogoOption } from '@remidy/contracts';
import { useEffect, useRef, useState } from 'react';
import { RequestFailure } from '../../core/session.ts';
import { Button, cn, FileButton, LogoTile } from '../../ui/index.ts';
import { logoUrl, suggestLogos, uploadLogo } from './api.ts';

const SOURCE_LABEL = { 'logo.dev': 'From Logo.dev', website: 'From its website' } as const;
const IMAGE_TYPES = 'image/png,image/jpeg,image/gif,image/webp,image/x-icon';
/** Waits for typing to pause before searching again. */
const WAIT_MS = 800;

const webAddress = (text: string): string | null => {
  const trimmed = text.trim();
  if (!URL.canParse(trimmed)) return null;
  return /^https?:$/.test(new URL(trimmed).protocol) ? trimmed : null;
};

interface LogoFieldProps {
  /** The bill's name, which is searched for. */
  name: string;
  /** The bill's website, whose own icon is offered too. */
  url: string;
  logoId: string | null;
  /** Whether the person chose the logo, or removed it, themselves. */
  chosen: boolean;
  onChange: (logoId: string | null, chosen: boolean) => void;
  /**
   * Picks the first logo found, until the person chooses one. Only for a new bill: editing one
   * never replaces its logo without being asked.
   */
  pickFirst: boolean;
}

/** The bill's logo, with a way to choose another, upload one, or remove it. */
export function LogoField({ name, url, logoId, chosen, onChange, pickFirst }: LogoFieldProps) {
  const [options, setOptions] = useState<LogoOption[]>([]);
  const [state, setState] = useState<'idle' | 'finding' | 'found' | 'failed'>('idle');
  const [open, setOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const latest = useRef(0);
  const website = webAddress(url);

  async function find(signal?: AbortSignal) {
    if (!name.trim()) return;
    const attempt = (latest.current += 1);
    setState('finding');
    try {
      const found = await suggestLogos(name.trim(), website, signal);
      if (attempt !== latest.current) return;
      setOptions(found.options);
      setState('found');
      const first = found.options[0];
      if (pickFirst && !chosen && first) onChange(first.logoId, false);
    } catch {
      if (attempt === latest.current && !signal?.aborted) setState('failed');
    }
  }

  // A new bill looks for a logo on its own, and again when its website changes.
  useEffect(() => {
    if (!pickFirst || chosen) return;
    const controller = new AbortController();
    const timer = setTimeout(() => void find(controller.signal), WAIT_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // Only the name and website decide what's found.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, website, pickFirst, chosen]);

  async function upload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      onChange(await uploadLogo(file), true);
      setOpen(false);
    } catch (error) {
      setUploadError(
        error instanceof RequestFailure
          ? (error.fields.image ?? error.message)
          : 'That didn’t upload. Try again.',
      );
    } finally {
      setUploading(false);
    }
  }

  let status = null;
  if (state === 'finding') status = 'Finding logos…';
  else if (state === 'failed') status = 'Logos couldn’t be found just now.';
  else if (state === 'found' && options.length === 0) {
    status = website
      ? 'No logos found. You can upload one.'
      : 'No logos found. Adding the website may find one, or you can upload one.';
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 font-semibold">Logo</legend>
      <div className="flex items-center gap-3">
        <LogoTile size="large" src={logoUrl(logoId)} name={name || '?'} />
        <span className="flex-auto text-sm text-ink-2">
          {logoId ? 'Shown beside this bill.' : 'None yet, so its initials are shown.'}
        </span>
        <Button
          type="button"
          variant="secondary"
          aria-expanded={open}
          onClick={() => {
            const opening = !open;
            setOpen(opening);
            if (opening && state === 'idle') void find();
          }}
        >
          {open ? 'Done' : 'Change'}
        </Button>
      </div>
      <p aria-live="polite" className="text-sm text-ink-2 empty:hidden">
        {status}
      </p>
      {open ? (
        <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
          {options.length > 0 ? (
            <ul aria-label="Logos found" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {options.map((option) => (
                <li key={option.logoId}>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-pressed={option.logoId === logoId}
                    className={cn(
                      'h-auto w-full flex-col gap-1 border border-line p-2 text-center font-normal whitespace-normal',
                      option.logoId === logoId && 'border-accent bg-accent-soft',
                    )}
                    onClick={() => {
                      onChange(option.logoId, true);
                    }}
                  >
                    <LogoTile size="large" src={logoUrl(option.logoId)} name={option.label} />
                    <span className="font-semibold break-all">{option.label}</span>
                    <span className="text-xs text-ink-2">{SOURCE_LABEL[option.source]}</span>
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <FileButton
              accept={IMAGE_TYPES}
              onFile={(file) => void upload(file)}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : 'Upload your own'}
            </FileButton>
            <Button
              type="button"
              variant="ghost"
              disabled={state === 'finding' || !name.trim()}
              onClick={() => void find()}
            >
              Search again
            </Button>
            {logoId ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  onChange(null, true);
                }}
              >
                Remove logo
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-ink-2">PNG, JPEG, GIF, WebP or ICO, up to 256 KB.</p>
          {uploadError ? (
            <p role="alert" className="text-sm text-danger">
              {uploadError}
            </p>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
