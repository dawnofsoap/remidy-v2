import { useRef, type ReactNode } from 'react';
import { Button } from './Button.tsx';

interface FileButtonProps {
  children: ReactNode;
  /** Which files to offer, such as `image/png,image/jpeg`. The server still checks what's sent. */
  accept: string;
  onFile: (file: File) => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
}

/** A button that asks for one file. The file input itself is hidden, and the button stands for it. */
export function FileButton({
  children,
  accept,
  onFile,
  disabled = false,
  variant = 'secondary',
}: FileButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared, so choosing the same file again still counts as a choice.
          event.target.value = '';
          if (file) onFile(file);
        }}
      />
      <Button
        type="button"
        variant={variant}
        disabled={disabled}
        onClick={() => {
          input.current?.click();
        }}
      >
        {children}
      </Button>
    </>
  );
}
