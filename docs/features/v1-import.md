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
- Given a v1 bill, then its frequency becomes a v2 schedule: `weekly` and `biweekly` become every 1 or 2 weeks,
  `monthly` and `quarterly` every 1 or 3 months, `annually` every year, the custom `N-weekly`, `N-monthly` and
  `N-yearly` every N of that unit, and `one-time` becomes once. Any other frequency is skipped, with the reason.
- Given a v1 bill's `start_date`, then it's the schedule's anchor, as on v1's dashboard and calendar. v1's reminders
  read `due_day` instead, so given a monthly bill whose `due_day` differs from its start date's day, then the review
  points it out so the person can check it.
- Given a v1 bill with no `start_date`, then it's skipped, with the reason, since v1 couldn't place its due dates
  either.
- Given a repeating v1 bill, then its first due date in v2 is its next one on or after the day of the import, on v1's
  schedule. Earlier ones were paid in v1, so they don't arrive as overdue. A v1 `end_date` becomes the last due date,
  and a bill that has ended, or a one-time bill already past, is listed as finished and left out unless included.
- Given a v1 bill's fields, then `bill_name` becomes the name, `amount` its expected amount in cents, read from the
  decimal text without rounding through floating point, `is_variable_amount` whether it varies, `auto_pay`, `url` and
  `notes` the same, and `category` the category by name. `is_active` false imports it archived.
- Given a v1 bill with a logo, stored by v1 as a data URL in `icon_url`, then it goes through the same type and size
  checks as an upload, and the bill imports without it if they fail.
- Given v1's dates, which its export writes as timestamps, then each is read as the calendar date it names.
- Given the export's other parts (payments, accounts, notifications, the user and household), then they're ignored.
  Accounts come in milestone 5.5 and payments in milestone 11.
- Given a v1 bill that can't be read, then it's listed as skipped, with the reason, and the rest still import.
- Given a v1 bill whose name matches one already in v2, then it's marked as a likely duplicate and left out unless the
  person includes it.
- Given v1 categories, then each one matches an existing category by name, or is created.
- Given a v1 bill marked `ownership: household`, and someone in a household, then it imports into the household's
  space, and a `personal` one into their personal space. Either can be changed in the review. Someone without a
  household gets them all in their personal space.
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

## v1's export
`GET /api/users/me/export` in v1 (`backend/src/services/dataExportService.js`) returns `exportVersion: '1.0'` and
arrays of `bills`, `categories`, `paymentAccounts`, `payments` and `notifications`, plus `user` and `household`. Each
bill is a row of v1's `bills` table with `payment_account_name` and `ownership` added. The import checks
`exportVersion`, and the test exports are made up in this shape.

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
