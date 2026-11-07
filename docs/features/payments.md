# Feature: Payments

**Status:** Approved
**Issue:** #

## Problem
Knowing what's due is half of it. People need to record what they paid, see what's still owed, and trust that the
record of past months never changes behind their back. v1 inferred "paid" from a date window and overwrote amounts, so
its history couldn't be trusted.

## In scope
- Marking a due date paid, in full or in part, with the date, amount, confirmation number and notes
- Auto-pay: recorded automatically on the due date
- Voiding a wrong payment with a reason, and recording the right one
- Skipping a due date that won't be charged, and undoing that
- Each bill's history of due dates and payments
- A calendar of due dates and what's been paid
- "Paid this month" on Home, beside what's left

## Out of scope
- Payment accounts, which arrive in milestone 5
- Reminders, which arrive in milestone 7
- Importing v1's payment history, which is milestone 11 and labeled unverified when it comes
- Splitting a payment across several bills, or paying several due dates at once

## Behavior
- Given an open due date, when someone marks it paid, then the amount defaults to what's still owed (or blank for a
  bill that varies), and the date defaults to today. Both can be changed.
- Given payments on a due date, then it's settled once non-voided payments reach the expected amount, and shows what's
  left until then. Paying more than expected settles it, and the extra is shown.
- Given a bill that varies, then its first payment settles the due date, whatever the amount.
- Given an auto-pay bill with a fixed amount, when its due date arrives in the space's time zone, then a payment of the
  expected amount is recorded as auto-pay, once only, even if the job runs twice. It can be voided if the charge failed.
- Given an auto-pay bill that varies, when its due date arrives, then nothing is recorded, and it shows as "auto-pay,
  amount needed" until someone enters the amount.
- Given a payment, when it's voided with a reason, then it stays in the history marked void with who and why, and no
  longer counts. Payments are never edited or deleted. A correction is a void and a new payment.
- Given a due date that won't be charged, when it's skipped, then it isn't overdue or owed, and it can be un-skipped.
- Given a household, then any member can record, void and skip payments on shared bills. Changing the bill itself still
  needs a manager or owner. Payments record who made them.
- Given a bill with payments, then it can't be deleted, only archived. Editing it never changes past due dates or their
  payments.
- Given totals, then "due" counts by due date, "paid" counts non-voided payments by the date paid, and every screen uses
  the same queries.
- Every payment, void and skip is recorded in the activity log.

## Data
Table `payment`, as in `DESIGN.md` section 6, without `account_id` until milestone 5. The `one_autopay_per_occurrence`
index makes duplicate auto-pay impossible. An occurrence's state follows its payments, set in the same transaction.
`bill_occurrence.bill_id` already cascades on delete. Payments restrict it, so the database refuses to delete a bill
with any.

## API
All under `/api/v1/spaces/:spaceId`, for any member of the space, except where noted.

| Route | Errors |
|---|---|
| `POST /occurrences/:occurrenceId/payments` amount, date, confirmation, notes | 422, 404, 409 skipped |
| `POST /payments/:paymentId/void` reason | 404, 409 already void |
| `POST /occurrences/:occurrenceId/skip`, `/unskip` | 404, 409 has payments |
| `GET /bills/:billId/history` due dates with their payments | 404 |
| `GET /api/v1/agenda` gains paid amounts and settled due dates, so it also serves the calendar | 422 |

## Screens
- **Home:** each due date has **Mark paid**, which opens a short sheet. The summary gains "Paid this month".
- **Bill history:** opening a bill shows its due dates and payments, with void and skip, beside the edit steps.
- **Calendar** in the main navigation: a month grid on wider screens with each day's bills and their status, and a list
  of days on phones.

## Depends on
Bills and occurrences, the activity log, the job runner, and `domain` money and dates.

## Lessons from v1
- Paid status was inferred from a date window. Payments now point at the due date they pay.
- Paying a variable bill overwrote its amount. The payment holds what was paid, and the bill is untouched.
- Deleting a bill deleted its payments. The database refuses.
- There were no tests on payments or auto-pay. The history invariance test below is the main one.

## Done when
- [ ] Every rule under Behavior has a test
- [ ] The history invariance test passes: random bills, payments, edits and archives never change a past period's
      totals
- [ ] Wrong-space and wrong-role requests are rejected, with tests
- [ ] One end-to-end test covers marking a bill paid and seeing it on Home and the calendar, at desktop and phone sizes
- [ ] Sample data includes paid, partly paid, voided and skipped due dates
- [ ] Docs updated
- [ ] You run your real bills on it for a full billing month with no status errors, which is milestone 4's exit test
