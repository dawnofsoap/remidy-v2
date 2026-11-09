import { cn } from '../../../ui/index.ts';
import type { Figure, HomeFigures } from './homeFigures.ts';

const TONE = { paid: 'text-paid', danger: 'text-danger' } as const;

function Tile({ figure, children }: { figure: Figure; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <dt className="text-sm text-ink-2">{figure.label}</dt>
      <dd
        className={cn(
          'text-xl font-semibold break-words tabular-nums sm:text-2xl',
          figure.tone && TONE[figure.tone],
        )}
      >
        {figure.value}
      </dd>
      <dd className="text-sm text-ink-2">{figure.detail}</dd>
      {children}
    </div>
  );
}

/** The month's figures across the top of Home, one card each. */
export function MonthFigures({ figures }: { figures: HomeFigures }) {
  const percent = figures.paidPercent;
  return (
    <section aria-labelledby="month-figures">
      <h2 id="month-figures" className="sr-only">
        This month
      </h2>
      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Tile figure={figures.leftToPay}>
          {percent === null ? null : (
            <dd className="mt-1 flex flex-col gap-1">
              <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="block h-full rounded-full bg-paid"
                  style={{ width: `${String(percent)}%` }}
                />
              </span>
              <span className="text-sm text-ink-2">{percent}% paid</span>
            </dd>
          )}
        </Tile>
        <Tile figure={figures.paid} />
        <Tile figure={figures.overdue} />
        <Tile figure={figures.soon} />
      </dl>
    </section>
  );
}
