import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { canManage, useSettingsSpace } from '../../../core/space.tsx';
import { Button, EmptyState, ErrorState, List, ListRow, LoadingState } from '../../../ui/index.ts';
import { categoriesKey, fetchCategories, type Category } from '../api.ts';
import { CategoryModal } from './CategoryModal.tsx';

/** What the modal is showing: a new category, one being edited, or nothing. */
type Editing = { category: Category | null } | null;

/** Categories for every bill the person sees: their household's, or their own without one. */
export function CategoriesSection() {
  const space = useSettingsSpace();
  return <SpaceCategories spaceId={space.id} canEdit={canManage(space)} />;
}

function SpaceCategories({ spaceId, canEdit }: { spaceId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const categories = useQuery({
    queryKey: categoriesKey(spaceId),
    queryFn: ({ signal }) => fetchCategories(spaceId, signal),
  });
  const [editing, setEditing] = useState<Editing>(null);
  const [showArchived, setShowArchived] = useState(false);

  if (categories.isPending) return <LoadingState label="Loading categories" />;
  if (categories.isError) {
    return (
      <ErrorState message="Categories couldn’t load." onRetry={() => void categories.refetch()} />
    );
  }

  const active = categories.data.filter((category) => !category.archived);
  const archived = categories.data.filter((category) => category.archived);
  const open = (category: Category) =>
    canEdit
      ? () => {
          setEditing({ category });
        }
      : undefined;
  const add = canEdit ? (
    <Button
      variant="secondary"
      onClick={() => {
        setEditing({ category: null });
      }}
    >
      Add category
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-3">
      {active.length === 0 ? (
        <EmptyState
          title="No categories"
          description="Categories group bills, such as Utilities or Insurance."
          action={add}
        />
      ) : (
        <>
          <List label="Categories" columns>
            {active.map((category) => (
              <CategoryRow key={category.id} category={category} onClick={open(category)} />
            ))}
          </List>
          {add ? <div>{add}</div> : null}
        </>
      )}

      {archived.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div>
            <Button
              variant="ghost"
              aria-expanded={showArchived}
              onClick={() => {
                setShowArchived((shown) => !shown);
              }}
            >
              {showArchived ? 'Hide archived' : `Show archived (${String(archived.length)})`}
            </Button>
          </div>
          {showArchived ? (
            <List label="Archived categories" columns>
              {archived.map((category) => (
                <CategoryRow key={category.id} category={category} onClick={open(category)} />
              ))}
            </List>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <CategoryModal
          spaceId={spaceId}
          category={editing.category}
          onClose={() => {
            setEditing(null);
          }}
          onChanged={() => queryClient.invalidateQueries({ queryKey: categoriesKey(spaceId) })}
        />
      ) : null}
    </div>
  );
}

function CategoryRow({
  category,
  onClick,
}: {
  category: Category;
  onClick: (() => void) | undefined;
}) {
  return <ListRow title={category.name} {...(onClick ? { onClick } : {})} />;
}
