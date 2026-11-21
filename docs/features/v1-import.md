# Feature: Importing bills from v1

**Status:** Approved
**Issue:** #108; milestone 5

## Problem
The owner's v1 bills need to arrive in v2 correctly, ready to review, without retyping them, so they can run their real
bills on v2 and v1 can be retired. Running those bills for a month is also the exit test of milestones 3 and 4.

## In scope
- Importing from v1's data export, the JSON file v1 already offers under its settings
- A review step before anything is saved, showing what will be created and anything that couldn't be read

## Out of scope
- Payment accounts, which come in milestone 5.5 ([payment-accounts.md](payment-accounts.md)). A v1 bill's account is
  left off for now.
- Importing bills from a CSV file. Nice to have, so it's in the backlog (#109).
- v1's payment history, which arrives in milestone 11 as a read-only, unverified archive
- Users and households, which people recreate

## Behavior
- Given v1's export, when it's uploaded, then nothing is saved until the person reviews a list of the bills and
  categories it found, with each bill's schedule in words and its next due dates.
- Given a v1 bill, then its frequency becomes a v2 schedule: weekly, every 2 weeks, monthly, quarterly, yearly and
  custom become "every N", and one-time becomes once. Its due day and start date set the first due date.
- Given a v1 bill that can't be read, then it's listed as skipped, with the reason, and the rest still import.
- Given a v1 bill whose name matches one already in v2, then it's marked as a likely duplicate and left out unless the
  person includes it.
- Given v1 categories, then each one matches an existing category by name, or is created.
- Given someone in a household, then the bills import into the household's space, and can be moved to their personal
  space in the review. Otherwise they import into their personal space.
- Given an import, then it all saves in one transaction, or none of it does, and the activity log records it.

## Data
No new tables. Imports write through the same code as adding by hand, so every rule still applies. Uploaded files are
read in memory and never stored.

## API
- `POST /api/v1/imports/preview` with a v1 export: returns what would be created, and saves nothing
- `POST /api/v1/imports` with the reviewed choices: saves it all in one transaction

## Screens
- **Import**, in Settings: choose a file, review the list with checkboxes, and import. On phones the review is a list
  of cards.

## Depends on
Bills, categories, the activity log, and `domain` schedules and money.

## Lessons from v1
- v1 stored categories on bills by name, and frequencies as free text with a separate `due_day`. The import has to
  read both shapes.
- v1's bulk CSV import had no review step, so mistakes were saved straight away.

## Done when
- [ ] Every rule under Behavior has a test, including every v1 frequency and a malformed export
- [ ] Wrong-space and wrong-role requests are rejected, with tests
- [ ] One end-to-end test covers importing a v1 export and seeing the bills, at desktop and phone sizes
- [ ] The test export is made up, never real v1 data
- [ ] Your v1 bills import correctly, ready to review, which is milestone 5's exit test
