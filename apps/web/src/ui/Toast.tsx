import { Toaster as Sonner, toast } from 'sonner';

/** Render once near the root of the app. Show messages with `toast('Saved')`. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
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
