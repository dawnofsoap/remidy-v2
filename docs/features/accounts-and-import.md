# Feature: Payment accounts and bill import

**Status:** Draft. It needs the owner's answers to the questions at the end before it's approved.
**Issue:** #

## Problem
People want to see which account pays each bill, and to bring their existing bills in without retyping them. Most
importantly, the owner's v1 bills need to arrive in v2 correctly, ready to review, so v1 can be retired.

## In scope
- Payment accounts: a name, a type (checking, savings, credit card, cash, other), the institution and the last four
  digits, all optional except the name
- A default account on each bill, and the account on each payment, defaulting to the bill's
- Importing from v1's data export, the JSON file v1 already offers under its settings
- Importing bills from a CSV file, with a template to download
- A review step before anything is saved, showing what will be created and anything that couldn't be read

## Out of scope
- Full card or account numbers. Only the last four digits, ever
- Card or bank artwork. v1 had it, but its licenses would need checking first, since this repo is public
- Bank connections and balances
- v1's payment history, which arrives in milestone 11 as a read-only, unverified archive
- Users and households, which people recreate

## Behavior
- Given an account, then it belongs to a space like a bill: personal accounts are only seen by their owner, and a
  household's are seen by its members.
- Given an account that payments used, then it can't be deleted, only archived.
- Given a payment, when it's recorded, then the account defaults to the bill's, and can be changed or left empty.
- Given v1's export, when it's uploaded, then nothing is saved until the person reviews a list of the bills, categories
  and accounts it found, with each bill's schedule in words and its next due dates.
- Given a v1 bill, then its frequency becomes a v2 schedule: weekly, every 2 weeks, monthly, quarterly, yearly and
  custom become "every N", and one-time becomes once. Its due day and start date set the first due date.
- Given a v1 bill that can't be read, then it's listed as skipped, with the reason, and the rest still import.
- Given a v1 bill whose name matches one already in v2, then it's marked as a likely duplicate and left out unless the
  person includes it.
- Given v1 categories, then each one matches an existing category by name, or is created.
- Given a CSV file, then it follows the downloadable template, and the same review applies.
- Given an import, then it all saves in one transaction, or none of it does, and the activity log records it.

## Data
Table `account`, as in `DESIGN.md` section 6, with a `default_account_id` on `bill` and `account_id` on `payment`, both
restricted. Imports write through the same code as adding by hand, so every rule still applies. Uploaded files are read
in memory and never stored.

## API
- `GET`, `POST /api/v1/spaces/:spaceId/accounts`, and `PATCH`, `DELETE /api/v1/spaces/:spaceId/accounts/:accountId`,
  for a manager to change, and any member to read
- `POST /api/v1/imports/preview` with a v1 export or a CSV file: returns what would be created, and saves nothing
- `POST /api/v1/imports` with the reviewed choices: saves it all in one transaction

## Screens
- **Accounts**, in Household, or in Settings for someone without a household, like categories. A list with Add, and
  one form per account.
- **The bill wizard** gains a default account on its Details step, and the payment sheet an account choice.
- **Import**, in Settings: choose a file, review the list with checkboxes, and import. On phones the review is a list
  of cards.

## Depends on
Bills, payments, categories, the activity log, and `domain` schedules and money.

## Lessons from v1
- v1 stored categories on bills by name, and frequencies as free text with a separate `due_day`. The import has to
  read both shapes, including bills edited after `due_day` was removed in January 2026.
- v1's bulk CSV import had no review step, so mistakes were saved straight away.

## Questions for the owner
1. Are account type, institution and last four digits the right fields? Anything else you used in v1?
2. Is a CSV import needed alongside the v1 import, or is v1's export enough?
3. Should accounts be personal or shared by default when someone has a household?

## Done when
- [ ] Every rule under Behavior has a test, including every v1 frequency and a malformed export
- [ ] Wrong-space and wrong-role requests are rejected, with tests
- [ ] One end-to-end test covers importing a v1 export and seeing the bills, at desktop and phone sizes
- [ ] Sample data includes accounts
- [ ] Your v1 bills import correctly, ready to review, which is milestone 5's exit test
