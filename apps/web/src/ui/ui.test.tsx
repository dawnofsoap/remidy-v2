// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toCents, type Cents } from '@remidy/domain';
import { cn } from './cn.ts';
import {
  Button,
  EmptyState,
  ErrorState,
  List,
  ListRow,
  LoadingState,
  Modal,
  MoneyField,
  NewPasswordField,
  SelectField,
  TextField,
} from './index.ts';

afterEach(cleanup);

describe('cn', () => {
  it('keeps a token color and a font size together', () => {
    expect(cn('text-sm', 'text-ink-2')).toBe('text-sm text-ink-2');
  });

  it('lets a later color override an earlier one', () => {
    expect(cn('bg-surface', 'bg-accent')).toBe('bg-accent');
  });
});

describe('Button', () => {
  it('does not submit forms unless asked to', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('cannot be triggered twice while busy', async () => {
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('fields', () => {
  it('connects the label to the input', () => {
    render(<TextField label="Bill name" />);
    expect(screen.getByLabelText('Bill name')).toBeInstanceOf(HTMLInputElement);
  });

  it('gives each field its own id', () => {
    render(
      <>
        <TextField label="First" />
        <TextField label="Second" />
      </>,
    );
    expect(screen.getByLabelText('First').id).not.toBe(screen.getByLabelText('Second').id);
  });

  it('announces hints and errors with the input', () => {
    render(<TextField label="Amount" hint="In dollars" error="Enter an amount" />);
    const input = screen.getByLabelText('Amount');
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription('In dollars Enter an amount');
  });

  it('is not marked invalid without an error', () => {
    render(<TextField label="Amount" />);
    expect(screen.getByLabelText('Amount')).toBeValid();
    expect(screen.getByLabelText('Amount')).not.toHaveAttribute('aria-describedby');
  });

  it('supports select fields', async () => {
    render(
      <SelectField label="Account" error="Choose an account">
        <option>Checking</option>
        <option>Savings</option>
      </SelectField>,
    );
    const select = screen.getByLabelText('Account');
    expect(select).toBeInvalid();
    await userEvent.selectOptions(select, 'Savings');
    expect(select).toHaveValue('Savings');
  });
});

describe('Modal', () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button
          onClick={() => {
            setOpen(true);
          }}
        >
          Open
        </Button>
        <Modal open={open} onOpenChange={setOpen} title="Mark paid" description="Settles the bill.">
          <TextField label="Amount" />
        </Modal>
      </>
    );
  }

  it('names itself, moves focus inside, and closes with Escape', async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));

    const dialog = screen.getByRole('dialog', { name: 'Mark paid' });
    expect(dialog).toHaveAccessibleDescription('Settles the bill.');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
    });
  });
});

describe('List', () => {
  it('renders a plain row without a button', () => {
    render(
      <List label="Bills">
        <ListRow title="Water" subtitle="Due Monday" />
      </List>,
    );
    expect(screen.getByRole('list', { name: 'Bills' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('makes the whole row clickable when given an action', async () => {
    const onClick = vi.fn();
    render(
      <List label="Bills">
        <ListRow title="Water" subtitle="Due Monday" onClick={onClick} />
      </List>,
    );
    await userEvent.click(screen.getByRole('button', { name: /Water/ }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('state panels', () => {
  it('announces loading', () => {
    render(<LoadingState label="Loading bills" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading bills');
  });

  it('offers the next step when empty', () => {
    render(
      <EmptyState
        title="No bills yet"
        description="Add your first bill."
        action={<Button>Add bill</Button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No bills yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add bill' })).toBeInTheDocument();
  });

  it('announces errors and can retry', async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Bills couldn’t load." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Bills couldn’t load.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('NewPasswordField', () => {
  function Example() {
    const [value, setValue] = useState('');
    return (
      <NewPasswordField
        label="New password"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
      />
    );
  }
  const field = () => screen.getByLabelText('New password');
  const requirement = (name: RegExp) => screen.getByText(name).closest('li');

  it('lists the requirements before anything is typed, without an error yet', () => {
    render(<Example />);
    expect(screen.getByText('At least 12 characters')).toBeVisible();
    expect(screen.getByText('A letter')).toBeVisible();
    expect(field()).not.toHaveAttribute('aria-invalid');
    expect(field()).toHaveAttribute('autocomplete', 'new-password');
  });

  it('is in its error state from the moment it is used', async () => {
    render(<Example />);
    await userEvent.click(field());
    expect(field()).toBeInvalid();
  });

  it('ticks requirements off during typing, and stays in error until all are met', async () => {
    render(<Example />);
    await userEvent.type(field(), 'tulip');
    expect(requirement(/^A letter/)).toHaveTextContent('(met)');
    expect(requirement(/^At least 12/)).toHaveTextContent('(not met)');
    expect(field()).toBeInvalid();

    await userEvent.type(field(), '-ca');
    expect(requirement(/^A number or symbol/)).toHaveTextContent('(met)');
    expect(field()).toBeInvalid();

    await userEvent.type(field(), 'ctus-river');
    expect(requirement(/^At least 12/)).toHaveTextContent('(met)');
    expect(field()).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('4 of 4 requirements met')).toBeInTheDocument();
  });

  it('goes back to its error state if the password stops qualifying', async () => {
    render(<Example />);
    await userEvent.type(field(), 'tulip-cactus-river');
    expect(field()).not.toHaveAttribute('aria-invalid');
    await userEvent.type(field(), '{Backspace}'.repeat(10));
    expect(field()).toBeInvalid();
  });

  it('flags a common word once it appears', async () => {
    render(<Example />);
    await userEvent.type(field(), 'my password 1');
    expect(requirement(/^No common words/)).toHaveTextContent('(not met)');
    expect(field()).toBeInvalid();
  });

  it('only mentions the longest length when it is exceeded', () => {
    const { rerender } = render(<NewPasswordField label="New password" value="short" readOnly />);
    expect(screen.queryByText(/No more than/)).not.toBeInTheDocument();
    rerender(<NewPasswordField label="New password" value={'x'.repeat(129)} readOnly />);
    expect(screen.getByText(/No more than 128/)).toBeVisible();
  });

  it('describes the requirements to screen readers', () => {
    render(<Example />);
    expect(field()).toHaveAccessibleDescription(/At least 12 characters ?\(not met\)/);
  });

  it('shows a problem from the server, even for a password that looks fine', () => {
    render(
      <NewPasswordField
        label="New password"
        value="tulip-cactus-river"
        readOnly
        error="Choose a different one."
      />,
    );
    expect(field()).toBeInvalid();
    expect(field()).toHaveAccessibleDescription(/Choose a different one/);
  });
});

describe('MoneyField', () => {
  function Amount({ start = null }: { start?: Cents | null }) {
    const [cents, setCents] = useState<Cents | null>(start);
    return (
      <>
        <MoneyField label="Amount" cents={cents} onCentsChange={setCents} />
        <output>{String(cents)}</output>
        <button
          onClick={() => {
            setCents(null);
          }}
        >
          Reset
        </button>
      </>
    );
  }
  const field = () => screen.getByRole('textbox', { name: 'Amount' });
  const stored = () => screen.getByRole('status');

  it.each([
    ['5', '5.00', '500'],
    ['5.', '5.00', '500'],
    ['5.5', '5.50', '550'],
    ['.5', '0.50', '50'],
    ['$1,000', '1000.00', '100000'],
  ])('reads %s as dollars and tidies it to %s on leaving', async (typed, tidied, cents) => {
    render(<Amount />);
    await userEvent.type(field(), typed);
    expect(stored()).toHaveTextContent(cents);
    expect(field()).toHaveValue(typed);

    await userEvent.tab();
    expect(field()).toHaveValue(tidied);
    expect(stored()).toHaveTextContent(cents);
    expect(field()).not.toHaveAttribute('aria-invalid');
  });

  it('shows what it holds', () => {
    render(<Amount start={toCents(123456)} />);
    expect(field()).toHaveValue('1234.56');
  });

  it.each(['abc', '1,23', '1.234', '-5'])('asks again for %s, keeping the text', async (typed) => {
    render(<Amount />);
    await userEvent.type(field(), typed);
    expect(stored()).toHaveTextContent('null');

    await userEvent.tab();
    expect(field()).toHaveValue(typed);
    expect(field()).toBeInvalid();
    expect(field()).toHaveAccessibleDescription(/such as 42\.50/);
  });

  it('clears the error as soon as the amount is fixed', async () => {
    render(<Amount />);
    await userEvent.type(field(), 'abc');
    await userEvent.tab();
    await userEvent.clear(field());
    await userEvent.type(field(), '7');
    expect(field()).not.toHaveAttribute('aria-invalid');
    expect(stored()).toHaveTextContent('700');
  });

  it('accepts being left empty', async () => {
    render(<Amount />);
    await userEvent.click(field());
    await userEvent.tab();
    expect(field()).toHaveValue('');
    expect(field()).not.toHaveAttribute('aria-invalid');
  });

  it('follows the value when the form resets it', async () => {
    render(<Amount start={toCents(500)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(field()).toHaveValue('');
  });

  it('shows an error from the form', () => {
    render(<MoneyField label="Amount" cents={null} onCentsChange={vi.fn()} error="Too large." />);
    expect(field()).toBeInvalid();
    expect(screen.getByText('Too large.')).toBeVisible();
  });
});
