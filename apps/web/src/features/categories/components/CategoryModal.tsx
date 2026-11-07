import { CATEGORY_NAME_MAX } from '@remidy/contracts';
import { useState, type SyntheticEvent } from 'react';
import { RequestFailure } from '../../../core/session.ts';
import { Button, Modal, TextField, toast } from '../../../ui/index.ts';
import { createCategory, deleteCategory, updateCategory, type Category } from '../api.ts';

interface CategoryModalProps {
  spaceId: string;
  /** The category to edit, or null to add one. */
  category: Category | null;
  onClose: () => void;
  /** Called after any change is saved, so the list can refresh. */
  onChanged: () => Promise<void>;
}

const messageOf = (failure: unknown) =>
  failure instanceof RequestFailure ? failure.message : 'That didn’t work. Try again.';

/** Adds a category, or renames, archives, restores or deletes one. */
export function CategoryModal({ spaceId, category, onClose, onChanged }: CategoryModalProps) {
  const [name, setName] = useState(category?.name ?? '');
  const [busy, setBusy] = useState<'save' | 'archive' | 'delete' | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function run(action: 'save' | 'archive' | 'delete', change: () => Promise<string>) {
    setBusy(action);
    setError(null);
    setNameError(null);
    try {
      const done = await change();
      await onChanged();
      toast(done);
      onClose();
    } catch (failure) {
      const field = failure instanceof RequestFailure ? failure.fields.name : undefined;
      if (field) setNameError(field);
      else setError(messageOf(failure));
      setConfirmingDelete(false);
    } finally {
      setBusy(null);
    }
  }

  function save(event: SyntheticEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Enter a name.');
      return;
    }
    void run('save', async () => {
      if (!category) {
        await createCategory(spaceId, trimmed);
        return `Added ${trimmed}.`;
      }
      await updateCategory(spaceId, category.id, { name: trimmed });
      return 'Category saved.';
    });
  }

  const archive = (archived: boolean) =>
    run('archive', async () => {
      if (!category) return '';
      await updateCategory(spaceId, category.id, { archived });
      return archived ? `Archived ${category.name}.` : `Restored ${category.name}.`;
    });

  const remove = () =>
    run('delete', async () => {
      if (!category) return '';
      await deleteCategory(spaceId, category.id);
      return `Deleted ${category.name}.`;
    });

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={category ? 'Edit category' : 'Add category'}
      description={
        category ? 'Rename, archive or delete this category.' : 'Name a new category for bills.'
      }
      hideDescription
    >
      <form onSubmit={save} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Name"
          value={name}
          maxLength={CATEGORY_NAME_MAX}
          autoComplete="off"
          onChange={(event) => {
            setName(event.target.value);
            setNameError(null);
          }}
          {...(nameError ? { error: nameError } : {})}
        />
        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy === 'save'} disabled={busy !== null}>
            {category ? 'Save' : 'Add'}
          </Button>
        </div>
      </form>

      {category ? (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          {confirmingDelete ? (
            <div role="group" aria-label="Confirm delete" className="flex flex-col gap-3">
              <p>
                Delete <strong>{category.name}</strong>? This can’t be undone.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setConfirmingDelete(false);
                  }}
                >
                  Keep it
                </Button>
                <Button
                  variant="danger"
                  busy={busy === 'delete'}
                  disabled={busy !== null}
                  onClick={() => void remove()}
                >
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-between gap-2">
              <Button
                variant="secondary"
                busy={busy === 'archive'}
                disabled={busy !== null}
                onClick={() => void archive(!category.archived)}
              >
                {category.archived ? 'Restore' : 'Archive'}
              </Button>
              <Button
                variant="danger"
                disabled={busy !== null}
                onClick={() => {
                  setConfirmingDelete(true);
                }}
              >
                Delete…
              </Button>
            </div>
          )}
          {!confirmingDelete && !category.archived ? (
            <p className="text-sm text-ink-2">
              Archiving hides it from new bills but keeps it for history.
            </p>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
