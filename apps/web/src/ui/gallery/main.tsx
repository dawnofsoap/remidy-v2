// A page showing every UI kit component, used by the browser tests. Not part of the production build.
import { parseCalendarDate } from '@remidy/domain';
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import {
  Button,
  DateField,
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
  toast,
  Toaster,
} from '../index.ts';

const theme = new URLSearchParams(window.location.search).get('theme');
if (theme === 'light' || theme === 'dark') {
  document.documentElement.dataset.theme = theme;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function PasswordExample() {
  const [password, setPassword] = useState('');
  return (
    <NewPasswordField
      label="New password"
      value={password}
      onChange={(event) => {
        setPassword(event.target.value);
      }}
    />
  );
}

function Gallery() {
  const [open, setOpen] = useState(false);
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <h1 className="text-3xl font-bold tracking-tight">UI kit</h1>
      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
          <Button busy>Busy</Button>
        </div>
      </Section>
      <Section title="Fields">
        <TextField label="Bill name" />
        <TextField label="Website" hint="Where you pay this bill." />
        <TextField label="Amount" defaultValue="abc" error="Enter an amount, such as 42.50." />
        <MoneyField label="Amount due" hint="Type 5 and leave the field." />
        <PasswordExample />
        <DateField label="Due date" hint="Type a date such as 3/8/26, or use the calendar." />
        <DateField
          label="Paid on"
          hint="Mar 15, 2026 to Jun 15, 2027."
          min={parseCalendarDate('2026-03-15') ?? undefined}
          max={parseCalendarDate('2027-06-15') ?? undefined}
        />
        <SelectField label="Paid from">
          <option>Everyday Checking</option>
          <option>Travel Card</option>
        </SelectField>
      </Section>
      <Section title="List">
        <List label="Example bills">
          <ListRow title="Water" subtitle="Due Monday" end="$64.20" />
          <ListRow
            title="Internet"
            subtitle="Opens a bill"
            end="$70.00"
            onClick={() => {
              toast('Opened');
            }}
          />
        </List>
      </Section>
      <Section title="Status colors">
        <div className="flex flex-wrap gap-2 text-sm font-semibold">
          <span className="rounded-full bg-danger-soft px-2 py-0.5 text-danger">4 days late</span>
          <span className="rounded-full bg-warn-soft px-2 py-0.5 text-warn">Due today</span>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2">Auto-pay</span>
          <span className="rounded-full bg-surface px-2 py-0.5 text-paid">Paid</span>
        </div>
      </Section>
      <Section title="States">
        <LoadingState label="Loading bills" />
        <EmptyState
          title="No bills yet"
          description="Add your first bill to see what’s due."
          action={<Button>Add bill</Button>}
        />
        <ErrorState
          message="Bills couldn’t load. Check your connection and try again."
          onRetry={() => undefined}
        />
      </Section>
      <Section title="Modal and toast">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setOpen(true);
            }}
          >
            Open modal
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              toast('Saved');
            }}
          >
            Show toast
          </Button>
        </div>
      </Section>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Mark paid"
        description="This settles the bill due Monday."
      >
        <TextField label="Amount paid" defaultValue="142.50" />
        <DateField label="Date paid" />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
            }}
          >
            Mark paid
          </Button>
        </div>
      </Modal>
      <Toaster />
    </main>
  );
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}
createRoot(container).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
