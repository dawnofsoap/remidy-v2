// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { initialsOf, LogoTile } from './index.ts';

afterEach(cleanup);

describe('LogoTile', () => {
  it.each([
    ['City Power & Light', 'CP'],
    ['StreamBox', 'S'],
    ['ünder 9 lives', 'Ü9'],
    ['---', ''],
  ])('takes initials from %s', (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });

  it('shows the logo, hidden from screen readers since the name is beside it', () => {
    const { container } = render(<LogoTile src="/api/v1/logos/a" name="Riverside Water" />);
    const tile = container.firstElementChild;
    expect(tile).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/v1/logos/a');
  });

  it('shows initials when there’s no logo, or it won’t load', () => {
    const { container, rerender } = render(<LogoTile src={null} name="Riverside Water" />);
    expect(container).toHaveTextContent('RW');
    rerender(<LogoTile src="/api/v1/logos/broken" name="Riverside Water" />);
    const image = container.querySelector('img');
    if (!image) throw new Error('No image');
    fireEvent.error(image);
    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('RW');
    // A different logo gets its own chance to load.
    rerender(<LogoTile src="/api/v1/logos/other" name="Riverside Water" />);
    expect(container.querySelector('img')).not.toBeNull();
  });
});
