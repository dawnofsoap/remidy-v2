// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Checkbox } from './Checkbox.tsx';

afterEach(cleanup);

describe('Checkbox', () => {
  function Harness({ disabled = false }: { disabled?: boolean }) {
    const [checked, setChecked] = useState(false);
    return (
      <Checkbox
        label="Water"
        description="Every month on the 15th"
        checked={checked}
        onChange={setChecked}
        disabled={disabled}
      />
    );
  }

  it('is named by its label, described by its description, and toggles', async () => {
    render(<Harness />);
    const box = screen.getByRole('checkbox', { name: 'Water' });
    expect(box).toHaveAccessibleDescription('Every month on the 15th');
    expect(box).not.toBeChecked();
    await userEvent.click(screen.getByText('Water'));
    expect(box).toBeChecked();
    await userEvent.keyboard(' ');
    expect(box).not.toBeChecked();
  });

  it('can’t be changed when disabled', async () => {
    render(<Harness disabled />);
    await userEvent.click(screen.getByText('Water'));
    expect(screen.getByRole('checkbox', { name: 'Water' })).not.toBeChecked();
  });
});
