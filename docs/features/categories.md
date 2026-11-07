# Feature: Categories

**Status:** Approved
**Issue:** #

## Problem
People group bills, such as Utilities or Insurance, to find them quickly and to see where money goes. Each space
needs its own list that its people can shape, before bills exist to use it.

## In scope
- A list of categories per space, in name order
- Create, rename and delete
- Archive and restore, for a category bills will later depend on
- A starter set in every new space, which can be edited or deleted like any other

## Out of scope
- Icons and colors. Names only for now, so the first feature stays small. Can be added later without a migration of
  existing names.
- Subcategories, budgets and statistics by category
- Assigning a category to a bill, which arrives with Bills (milestone 3)
- Sharing categories between spaces, or global defaults that can't be edited

## Behavior
- Given a new space, when it's created, then it has the starter set: Housing, Utilities, Phone and internet,
  Insurance, Loans, Subscriptions, Healthcare, Transportation and Other.
- Given a name, when it's saved, then surrounding spaces are removed and it must be 1 to 50 characters.
- Given a category named "Utilities", when another is created or renamed as "utilities", then it's refused as a
  duplicate in that space, including archived ones. Another space may use the same name.
- Given a category with no history, when it's deleted, then it's gone.
- Given a category with history (once bills use it), when someone tries to delete it, then they're told to archive it
  instead. Nothing with history is deleted.
- Given an archived category, then it's hidden from choices for new bills but still listed under "Archived", and can
  be restored.
- Given a space member, then they can see the list. Changing it needs the manager or owner role. In a personal space
  the person is the owner.
- Given someone outside the space, then every request answers "not found".
- Every create, rename, archive, restore and delete is recorded in the space's activity log.

## Data
New table `category`: `id`, `space_id` (foreign key, restrict), `name`, `archived_at` (nullable), `created_at`.
Unique index on `(space_id, lower(name))`. A new migration, with no change to released data. Starter categories are
added for existing spaces in the same migration, and for new spaces when the space is created.

## API
All under `/api/v1/spaces/:spaceId/categories`.

| Route | Access | Errors |
|---|---|---|
| `GET` list, `?archived=true` for archived | member | |
| `POST` create | manager | 400 invalid name, 409 duplicate |
| `PATCH /:categoryId` rename, archive or restore | manager | 400, 404, 409 |
| `DELETE /:categoryId` | manager | 404, 409 has history |

## Screens
A **Categories** section in Settings, under "Your space", since it's set up once and rarely changed. A list with Add,
Rename and a menu with Archive and Delete. Members without the manager role see the list without the controls.
States: loading, an empty list with an Add button, an error with Try again, and a collapsed "Archived" section. Add
and Rename use a modal, which is a bottom sheet on phones.

## Depends on
Spaces (`space` and membership roles), the activity log, and the UI kit's List, Modal, Field, Button and Toast.

## Lessons from v1
- v1 linked bills to categories **by name**, so renaming a category silently detached its bills. v2 links by id;
  a test renames a category and checks its id is unchanged.
- v1's stats grouped payments by the bill's **current** category, so recategorizing rewrote past spending. That's for
  Payments and Insights to solve, and is noted here so it isn't lost.
- v1 had global defaults that nobody could edit, and personal and household categories mixed in one list. v2 copies
  a starter set into each space instead.
- v1 kept the role in two places that could disagree. v2 uses only the space membership.

## Done when
- [ ] Every rule under Behavior has a test
- [ ] Wrong-space and wrong-role requests are rejected, with tests
- [ ] One end-to-end test covers the main journey at desktop and mobile sizes
- [ ] Docs and changelog updated
- [ ] Stabilization period finished with no open P0 or P1 bugs
