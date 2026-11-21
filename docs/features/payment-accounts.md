# Feature: Payment accounts

**Status:** Approved
**Issue:** None yet; milestone 5.5

## Problem
People want to see which account pays each bill.

## In scope
- Payment accounts: a name, a type (checking, savings, credit card, cash, other), the institution and the last four
  digits, all optional except the name
- A default account on each bill, and the account on each payment, defaulting to the bill's
- Bringing in v1's accounts from the same export used in milestone 5, and linking them to the bills already imported

## Out of scope
- Full card or account numbers. Only the last four digits, ever
- Card or bank artwork. v1 had it, but its licenses would need checking first, since this repo is public
- Bank connections and balances

## Behavior
- Given an account, then it belongs to a space like a bill: personal accounts are only seen by their owner, and a
  household's are seen by its members.
- Given someone in a household, when they add an account, then it's in the household's space unless they choose
  personal. Otherwise it's personal.
- Given an account that payments used, then it can't be deleted, only archived.
- Given a payment, when it's recorded, then the account defaults to the bill's, and can be changed or left empty.
- Given v1's export, when its accounts are brought in, then each matches an existing account by name or is created,
  and each v2 bill named like a v1 bill with that account gets it as its default, after a review like milestone 5's.
  Bills already given an account in v2 keep it.

## Data
Table `account`, as in `DESIGN.md` section 6, with a `default_account_id` on `bill` and `account_id` on `payment`, both
restricted.

## API
- `GET`, `POST /api/v1/spaces/:spaceId/accounts`, and `PATCH`, `DELETE /api/v1/spaces/:spaceId/accounts/:accountId`,
  for a manager to change, and any member to read

## Screens
- **Accounts**, in Household, or in Settings for someone without a household, like categories. A list with Add, and
  one form per account.
- **The bill wizard** gains a default account on its Details step, and the payment sheet an account choice.

## Depends on
Bills, payments, the v1 import, and the activity log.

## Done when
- [ ] Every rule under Behavior has a test
- [ ] Wrong-space and wrong-role requests are rejected, with tests
- [ ] Sample data includes accounts
