import { useNavigate, useRouterState } from '@tanstack/react-router';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import { Button, List, ListRow, Modal } from '../ui/index.ts';
import { chooseSpace, useCurrentSpace, useSpaces } from './space.tsx';

/** Shows which space everything is about, and changes it. */
export function SpaceSwitcher() {
  const [open, setOpen] = useState(false);
  const spaces = useSpaces().data ?? [];
  const current = useCurrentSpace();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (!current) return null;

  function choose(id: string) {
    chooseSpace(id);
    setOpen(false);
    // A page about one space follows the switch, rather than staying on the old one.
    const match = /^\/spaces\/[^/]+(\/.*)?$/.exec(pathname);
    if (match) void navigate({ to: `/spaces/${id}${match[1] ?? ''}` });
  }

  return (
    <>
      <Button
        variant="ghost"
        className="w-full justify-between px-3"
        aria-label={`Space: ${current.name}. Change space`}
        onClick={() => {
          setOpen(true);
        }}
      >
        <span className="truncate">{current.name}</span>
        <ChevronsUpDown aria-hidden="true" className="size-4 flex-none text-ink-2" />
      </Button>
      {open ? (
        <Modal
          open
          onOpenChange={setOpen}
          title="Spaces"
          description="Bills and settings belong to a space. Choose the one to work in."
        >
          <List label="Your spaces">
            {spaces.map((space) => (
              <ListRow
                key={space.id}
                title={space.name}
                subtitle={space.kind === 'personal' ? 'Only you' : 'Shared'}
                end={
                  space.id === current.id ? (
                    <Check aria-label="Current space" className="size-5 text-accent-text" />
                  ) : null
                }
                onClick={() => {
                  choose(space.id);
                }}
              />
            ))}
          </List>
          <p className="text-sm text-ink-2">Shared spaces for a household arrive later.</p>
        </Modal>
      ) : null}
    </>
  );
}
