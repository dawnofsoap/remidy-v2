import { cn, focusRing } from './cn.ts';

interface StepsProps {
  steps: readonly string[];
  /** The step showing, counting from 0. */
  current: number;
  /** Lets people jump to a step, such as when editing something that's already complete. */
  onSelect?: (index: number) => void;
}

/**
 * Where someone is in a task split into steps, such as adding a bill. It names the current step for
 * screen readers, and a bar shows how far along it is.
 */
export function Steps({ steps, current, onSelect }: StepsProps) {
  return (
    <nav aria-label="Steps" className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-ink-2">
        Step {current + 1} of {steps.length}: <span className="text-ink">{steps[current]}</span>
      </p>
      <ol className="flex gap-1.5">
        {steps.map((step, index) => {
          const bar = cn(
            'block h-1.5 w-full rounded-full',
            index <= current ? 'bg-accent' : 'bg-surface-2',
          );
          return (
            <li key={step} className="flex-1" aria-current={index === current ? 'step' : undefined}>
              {onSelect ? (
                // A tall target around a thin bar, so it's easy to tap.
                <button
                  type="button"
                  aria-label={`Go to ${step}`}
                  onClick={() => {
                    onSelect(index);
                  }}
                  className={cn(
                    'flex min-h-11 w-full cursor-pointer items-center rounded-md',
                    focusRing,
                  )}
                >
                  <span className={bar} />
                </button>
              ) : (
                <span className={bar} title={step} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
