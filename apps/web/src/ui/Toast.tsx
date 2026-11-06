import { Toaster as Sonner, toast } from 'sonner';

/**
 * Render once near the root of the app. Show messages with `toast('Saved')`.
 *
 * Toasts go at the top, because the bottom of a phone screen has the navigation bar and the buttons
 * people are about to press. Nothing needed should ever be underneath one.
 */
export function Toaster() {
  return (
    <Sonner
      position="top-right"
      // Clear of the notch and status bar on phones.
      mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 16px)', left: 16, right: 16 }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 text-ink',
          actionButton: 'min-h-11 cursor-pointer px-3 font-semibold text-accent-text',
        },
      }}
    />
  );
}

export { toast };
