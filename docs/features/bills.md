# Feature: Bills and occurrences

**Status:** Approved
**Issue:** #

## Problem
People need to see what's due and when, without working out dates themselves. v1 calculated due dates in three
places that disagreed, so Remidy needs one tested rule that every screen uses.

## In scope
- Bills: name, expected amount or "varies", schedule, category, personal or shared, auto-pay flag, link, notes
- Schedules: once, or every N weeks, months or years from a first due date, with an optional last date
- Occurrences: each due date, generated 13 months ahead and kept for history
- The agenda on Home: overdue, what's left this month, and what's coming after
- A Bills page to add, edit, archive and delete bills

## Out of scope
- Marking paid, payments and the calendar view, which arrive in milestone 4
- Payment accounts, which arrive in milestone 5
- Moving dates off weekends or holidays. Bills show the biller's real date
- Reminders, which arrive in milestone 7
- "Paid by" for shared bills, which arrives with Sharing, since there are no other members yet

## Behavior
- Given a first due date and "every N months", then each date keeps the first date's day of the month, or the last
  day of a shorter month. Jan 31 gives Feb 28 (29 in a leap year), then Mar 31, never drifting to the 28th.
- Given "every N weeks", then each date is 7 × N days after the last.
- Given "once", then there's exactly one occurrence.
- Given a last date, then nothing is due after it.
- Given a new bill, then its occurrences start at the beginning of this month, or its first due date if that's
  later, and reach 13 months from today. A date earlier this month shows as overdue, but a bill started years ago
  doesn't arrive with years of unpaid dates. An hourly job keeps every bill 13 months ahead, and running it twice
  changes nothing.
- Given today, then "today" is the bill's space's date in that space's time zone, and a bill due before it with
  no payment is overdue.
- Given an edit to a bill, then only future occurrences change. Past ones keep the name, category and amount
  they had.
- Given a bill with no payments, then it can be deleted, with its occurrences. Once payments exist (milestone 4),
  the database refuses, and it can only be archived, which stops new occurrences but keeps the past.
- Given a category that bills use, then it can't be deleted, only archived.
- Given a variable bill, then its expected amount is optional and shown as "varies".
- Given someone in a household, when they add a bill, then they choose personal or shared, and personal is the
  default. Without a household there's no choice.
- Given a personal bill, then nobody else ever sees it, including other members of the same household.
- Given a bill's category, then it comes from the household's list if the person has a household, or their own if
  not. That holds for personal bills too, so one filter covers everything they see.
- Given someone who leaves a household (with Sharing), then household categories their personal bills use are
  copied into their own list, and the bills point at the copies.
- Every create, edit, archive and delete is recorded in the activity log.

## Data
Tables `bill` and `bill_occurrence`, as in `DESIGN.md` section 6. `bill.category_id` may point at a category in
the household that owns the person's lists, which resolves open decision 2. The database checks that the category
belongs to the bill's space, or to a household its owner belongs to. A unique `(bill_id, due_on)` keeps generation
safe to repeat. No released data changes.

## API
Reading covers every space the caller belongs to, never one chosen space. Changing goes through the bill's
space, so the usual role check applies.

| Route | Access | Errors |
|---|---|---|
| `GET /api/v1/bills` all the caller's bills | signed-in | |
| `GET /api/v1/agenda?from&to`: overdue, plus the range, up to 400 days | signed-in | 422 bad range |
| `POST /api/v1/spaces/:spaceId/bills` personal or household | manager | 422, 404 |
| `PATCH /api/v1/spaces/:spaceId/bills/:billId`, including `archived` | manager | 422, 404 |
| `DELETE /api/v1/spaces/:spaceId/bills/:billId` | manager | 404, 409 has payments |

## Screens
- **Home** becomes the agenda: Overdue, then the rest of this month, then later months, each row showing the bill,
  amount, due date, and Personal or Shared. States: loading, an empty first-run state that offers to add a bill,
  and error.
- **Bills** in the main navigation: every bill with its schedule in words, such as "Monthly on the 31st", and an Add
  button. One form for adding and editing, using the date and money fields, as a bottom sheet on phones.

## Depends on
Spaces, categories, the activity log, the job runner, and `domain` dates and money.

## Lessons from v1
- Due dates were calculated in the backend, the scheduler and the browser, and disagreed. They now come from one
  function in `domain`, with property tests.
- `due_day` was removed after features depended on it. The schedule is one rule with an anchor date.
- Deleting a bill deleted its payments. The database refuses to delete a bill with past occurrences.
- Paying a variable bill overwrote its amount. Occurrences copy the expected amount, and payments hold the actual
  one (milestone 4).
- Stats grouped by the current category. Occurrences copy the category, so reports read what it was.

## Done when
- [ ] Every rule under Behavior has a test, with property tests for schedules
- [ ] Wrong-space and wrong-role requests are rejected, with tests, including another member's personal bill
- [ ] One end-to-end test covers adding a bill and seeing it on the agenda, at desktop and phone sizes
- [ ] Docs updated
- [ ] Your real bills show the correct due dates, which is milestone 3's exit test
