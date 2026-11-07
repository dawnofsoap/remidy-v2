import { Dialog } from 'radix-ui';
import { useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Says what the modal is for. Read out when it opens. */
  description: string;
  /** Keeps it for screen readers only, when what's on screen already makes it clear. */
  hideDescription?: boolean;
  children: ReactNode;
}

/** A centered dialog on larger screens and a bottom sheet on phones. Focus stays inside it. */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  hideDescription = false,
  children,
}: ModalProps) {
  // Radix only returns focus to its own Trigger, and this modal is opened from anywhere.
  const returnFocusTo = useRef<HTMLElement | null>(null);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-scrim" />
        <Dialog.Content
          onOpenAutoFocus={() => {
            returnFocusTo.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusTo.current?.focus();
          }}
          className="fixed inset-x-0 bottom-0 flex max-h-[90dvh] flex-col gap-4 overflow-y-auto rounded-t-3xl bg-surface p-6 text-ink sm:inset-x-auto sm:top-24 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:rounded-3xl"
        >
          <div className="flex flex-col gap-1">
            <Dialog.Title className="text-xl font-bold tracking-tight">{title}</Dialog.Title>
            <Dialog.Description className={hideDescription ? 'sr-only' : 'text-ink-2'}>
              {description}
            </Dialog.Description>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
