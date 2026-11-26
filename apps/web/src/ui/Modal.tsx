import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useRef, type ReactNode } from 'react';
import { Button } from './Button.tsx';

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

/**
 * A centered dialog on larger screens and a bottom sheet on phones. Focus stays inside it, and its
 * body scrolls when it's taller than the window, under a title that stays put.
 *
 * Every dialog closes the same ways: the ✕ in its top corner, Escape, or a tap outside it. So a
 * dialog only for looking at something has no Close button of its own. Its buttons go in
 * ModalActions, which sets their order.
 */
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
          className="fixed inset-x-0 bottom-0 flex max-h-[90dvh] flex-col rounded-t-3xl bg-surface text-ink sm:inset-x-auto sm:top-24 sm:bottom-auto sm:max-h-[calc(100dvh-8rem)] sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:rounded-3xl"
        >
          {/* Room on the right for the ✕. */}
          <div className="flex flex-col gap-1 px-6 pt-6 pr-16">
            <Dialog.Title className="text-xl font-bold tracking-tight">{title}</Dialog.Title>
            <Dialog.Description className={hideDescription ? 'sr-only' : 'text-ink-2'}>
              {description}
            </Dialog.Description>
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto px-6 pt-4 pb-6">{children}</div>
          {/* Last in the page, so a form's first field is still where focus starts. */}
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close"
              title="Close"
              className="absolute top-4 right-4"
            >
              <X aria-hidden="true" className="size-5" />
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
