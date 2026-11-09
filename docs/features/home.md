# Feature: Home as cards

**Status:** Approved
**Issue:** #75

## Problem
Home answers "what needs my attention", but it reads as one long list beside a tall summary, and it's hard to take in
at a glance, and it lists the next few months as well, which the Calendar already shows. v1's Home was a grid of
cards (a row of month figures, an overdue banner, the month's bills and recent payments), which people liked. Home
should get that polish, using data v2 already has, and be about this month only.

## In scope
- **Figures across the top**, one card each: Left to pay this month (with a bar for how much of the month is paid),
  Paid this month, Overdue, and Due in the next 7 days
- **An overdue card**, tinted red, only when something is overdue
- **This month's bills** in a wide card, as tiles in columns, with the small calendar beside it
- **This month's payments:** what's been paid since the 1st, with the total
- Long cards show their first few items and "Show N more"
- A new read-only route listing payments in a date range, for this month's payments

## Out of scope
- **Income** and what's left after bills, which needs income and belongs to Insights (milestone 9). It goes in the
  backlog.
- Moving, resizing, hiding or choosing cards. The layout is fixed ("Drag-and-resize dashboard widgets" is
  deliberately not planned).
- Later months, which are on the Calendar page. Home no longer lists them.
- Charts and statistics, which belong to Insights.
- Changing how any figure is worked out. The figures are the ones Home shows today.

## Behavior
- Given the figures, then each is worked out as Home does today: a bill that varies is counted, not added, as in
  "$45.00 + 1 that varies", and a partly paid bill counts what's left.
- Given a month with amounts due, then the Left to pay bar shows paid against paid plus what's left. Bills that vary
  don't count toward it until paid. The bar has a text equivalent, such as "40% paid".
- Given nothing overdue, then there's no overdue card, and the Overdue figure says None.
- Given overdue bills, then the overdue card lists them first on every screen size, oldest first.
- Given this month's bills, then they're the ones due from today to the month's end, soonest first, each with its
  status as now, and each opens its preview.
- Given a card with more items than it shows, then "Show N more" shows the rest, and "Show less" hides them again.
- Given this month's payments, then they're the payments made from the 1st to today, newest first, without voided
  ones, titled with the month, such as "Paid in November". The total is their sum, and matches Paid this month. With
  none, it says "Nothing paid yet in November", naming the month.
- Given bills due after this month, then Home doesn't list them, except in Due in the next 7 days, which can run into
  the next month so a bill due in two days is never hidden.
- Given an overdue bill from an earlier month, then it's still in the overdue card, since it still needs paying.
- Given a household, then shared and personal bills both show, each marked as now, and only bills the person can see.
- Given a phone, then the cards stack in this order: overdue, figures in two columns, this month's bills, this
  month's payments. The small calendar stays off phones, where the Calendar page is a tab away.
- Given any width from a phone to 3840 pixels, then the cards fill the width, with more columns on wider screens.

## Data
No changes. Recent payments reads `payment`, which already has an index on space and paid date.

## API
| Route | Who | Errors |
|---|---|---|
| `GET /api/v1/payments?from=&to=` payments not voided, paid in the range, newest first, across every space the person belongs to, each with its bill's name, logo and space, its amount, date and who recorded it | Signed in | 422 for a bad or too long range, as `/api/v1/agenda` |

## Screens
- **Desktop:** the figures in a row of four; under them the overdue card; then this month's bills, two cards wide,
  and beside them the small calendar with this month's payments under it.
- **Phone:** stacked as under Behavior.
- **Loading:** each card holds its place, so the page doesn't jump. **Error:** a card that can't load says so with
  Try again, and the others still show. **Empty:** with no bills at all, Home keeps its current empty state.

## Depends on
The agenda and totals routes, payments, `BillViewer` for opening a bill, and the small calendar.

## Lessons from v1
- Keep the grid of cards, the tinted overdue banner and the payments card. v1's next month preview is left to the
  Calendar, to keep Home about this month.
- v1 fixed each card at 426 pixels tall so a row lined up, so content had to fit that height. Cards here are only as
  tall as their content, so larger text and wider screens still fit, and no card is padded to match its neighbour.

## Done when
- [ ] Every rule under Behavior has a test
- [ ] The payments route only returns payments from the person's spaces, with tests
- [ ] One end-to-end test covers Home at desktop and phone sizes, with screenshots at 1366, 1920, 2560 and phone
- [ ] Docs and changelog updated
- [ ] Used through the rest of Alpha 1's month with no open P0 or P1 bugs
