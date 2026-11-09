import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { cn, focusRing } from '../ui/index.ts';
import type { SettingsSection } from './feature.ts';
import { placeLink, placeList } from './navStyles.ts';
import { Page } from './Page.tsx';
import { NotFoundPage } from './pages.tsx';

/** Back up a level on a phone, such as from a section to its area. */
function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex min-h-11 items-center gap-1 rounded-xl pr-3 font-semibold text-accent-text',
        focusRing,
      )}
    >
      <ChevronLeft aria-hidden="true" className="size-5" />
      {label}
    </Link>
  );
}

interface SettingsAreaProps {
  title: string;
  /** Shown under the title, such as the space's name. */
  subtitle?: ReactNode;
  /** The area's address, such as `/settings`. Sections are below it. */
  basePath: string;
  sections: SettingsSection[];
  /** The section in the address, if any. */
  section: string | undefined;
}

// Tailwind's `md`, where the sidebar appears and there's room for the list beside a section.
const WIDE = '(min-width: 48rem)';

/**
 * A settings area: a list of sections beside the chosen one on larger screens. On phones the
 * list is its own page, and each section opens on its own with a way back.
 */
export function SettingsArea({ title, subtitle, basePath, sections, section }: SettingsAreaProps) {
  const navigate = useNavigate();
  const current = sections.find((candidate) => candidate.slug === section);
  const first = sections[0];

  // With room for both, the area opens on its first section rather than an empty space.
  useEffect(() => {
    if (section || !first || !window.matchMedia(WIDE).matches) return;
    void navigate({ to: `${basePath}/${first.slug}`, replace: true });
  }, [section, first, basePath, navigate]);

  if (section && !current) return <NotFoundPage />;
  const Section = current?.component;

  return (
    <Page
      title={title}
      hideTitleOnPhone={Boolean(current)}
      // Phones reach an area from More, and a section from the area's list.
      back={
        current ? <BackLink to={basePath} label={title} /> : <BackLink to="/more" label="More" />
      }
    >
      {subtitle ? (
        <p className={cn('-mt-4 text-ink-2', current && 'max-md:hidden')}>{subtitle}</p>
      ) : null}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:items-start md:gap-10">
        <nav aria-label={`${title} sections`} className={cn(current && 'hidden md:block')}>
          <ul className={placeList}>
            {sections.map((item) => (
              <li key={item.slug}>
                <Link to={`${basePath}/${item.slug}`} className={placeLink}>
                  {item.title}
                  <ChevronRight
                    aria-hidden="true"
                    className="ml-auto size-5 text-ink-2 md:hidden"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {current && Section ? (
          <section
            aria-labelledby="section-title"
            className="flex min-w-0 max-w-5xl flex-col gap-4"
          >
            <h2
              id="section-title"
              className="text-2xl font-bold tracking-tight md:text-xl md:font-semibold"
            >
              {current.title}
            </h2>
            <Section />
          </section>
        ) : null}
      </div>
    </Page>
  );
}
