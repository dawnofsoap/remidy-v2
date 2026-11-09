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
- **This month's bills** in one wide card, as tiles in columns, with the small calendar beside it: what's left to pay
  first, then what's been paid or skipped, with paid ones in the paid color
- Long cards show their first few items and "Show N more"

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
- Given this month's bills, then they're every due date in the month, from the 1st: the ones still to pay first,
  soonest first, then the paid and skipped ones, soonest first. Each opens its preview, and the card's header says how
  many are to pay and how many are paid.
- Given a paid due date, then its amount says "Paid" in the paid color, with a check on its logo, so it's told apart
  by more than color. A partly paid one is still to pay, and says what's left.
- Given a card with more items than it shows, then "Show N more" shows the rest, and "Show less" hides them again.
- Given bills due after this month, then Home doesn't list them, except in Due in the next 7 days, which can run into
  the next month so a bill due in two days is never hidden.
- Given an overdue bill from an earlier month, then it's still in the overdue card, since it still needs paying.
- Given a household, then shared and personal bills both show, each marked as now, and only bills the person can see.
- Given a phone, then the cards stack in this order: overdue, figures in two columns, this month's bills. The small calendar stays off phones, where the Calendar page is a tab away.
- Given any width from a phone to 3840 pixels, then the cards fill the width, with more columns on wider screens.

## Data
No changes.

## API
No new routes. Home asks `/api/v1/agenda` from the 1st of the month, which already returns paid and skipped due dates
with what's been paid toward them.

## Screens
- **Desktop:** the figures in a row of four; under them the overdue card; then this month's bills, two cards wide,
  and beside them the small calendar.
- **Phone:** stacked as under Behavior.
- **Loading:** each card holds its place, so the page doesn't jump. **Error:** a card that can't load says so with
  Try again, and the others still show. **Empty:** with no bills at all, Home keeps its current empty state.

## Depends on
The agenda and totals routes, `BillViewer` for opening a bill, and the small calendar.

## Lessons from v1
- Keep the grid of cards and the tinted overdue banner. v1's recent payments are shown as paid bills in the month's
  card, and its next month preview is left to the Calendar, to keep Home about this month.
- v1 fixed each card at 426 pixels tall so a row lined up, so content had to fit that height. Cards here size to
  their content and line up by row, so larger text and wider screens still fit.

## Done when
- [ ] Every rule under Behavior has a test
- [ ] One end-to-end test covers Home at desktop and phone sizes, with screenshots at 1366, 1920, 2560 and phone
- [ ] Docs and changelog updated
- [ ] Used through the rest of Alpha 1's month with no open P0 or P1 bugs
