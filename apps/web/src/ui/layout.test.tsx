// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Steps, Table } from './index.ts';

afterEach(() => {
  cleanup();
});

describe('Table', () => {
  const rows = [
    { id: 'a', name: 'Rent', amount: '$1,450.00' },
    { id: 'b', name: 'Water', amount: '$45.00' },
  ];
  const columns = [
    { key: 'name', header: 'Name', cell: (row: (typeof rows)[number]) => row.name },
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      cell: (row: (typeof rows)[number]) => row.amount,
    },
  ];

  it('has a name, column headers and a row for each item', () => {
    render(<Table label="Bills" columns={columns} rows={rows} rowKey={(row) => row.id} />);
    const table = screen.getByRole('table', { name: 'Bills' });
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Name',
      'Amount',
    ]);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens a row from its button or a click anywhere on it, once each time', async () => {
    const onRowClick = vi.fn();
    render(
      <Table
        label="Bills"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        onRowClick={onRowClick}
        rowLabel={(row) => `Edit ${row.name}`}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit Water' }));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenLastCalledWith(rows[1]);
    await userEvent.click(screen.getByText('$1,450.00'));
    expect(onRowClick).toHaveBeenCalledTimes(2);
    expect(onRowClick).toHaveBeenLastCalledWith(rows[0]);
  });
});

describe('Steps', () => {
  const steps = ['What it is', 'When it’s due', 'Details'];

  it('names the current step, and marks it for screen readers', () => {
    render(<Steps steps={steps} current={1} />);
    expect(screen.getByRole('navigation', { name: 'Steps' })).toHaveTextContent(
      'Step 2 of 3: When it’s due',
    );
    const items = screen.getAllByRole('listitem');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('lets people jump to a step only when allowed', async () => {
    const onSelect = vi.fn();
    render(<Steps steps={steps} current={0} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'Go to Details' }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
