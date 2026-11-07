# Roadmap

Milestones run in order, and each must meet its exit test before the next begins. There are no dates:
stability decides when a milestone is finished.

## Milestones

| # | Milestone | Contains | Exit test | Stabilize |
|---|---|---|---|---|
| **0** | Repo and tooling | Workspace, CI, branch rules, lint and boundary rules, Docker dev setup | A fresh clone runs with one command; a rule-breaking pull request is blocked | None |
| **1** | The base | Starts with the design pass in [DESIGN.md section 8](../DESIGN.md#8-visual-design), then everything in [section 5](../DESIGN.md#5-the-base), no bill features | Layout approved; meets the base exit test. The final color and style can change later through the design tokens | None, because nobody uses it yet |
| **2** | Reference feature: Categories | Create, edit, delete, list | Built entirely by following `BUILDING-FEATURES.md`; the guide and base are corrected wherever it was awkward | A few days |
| **3** | Bills and occurrences | Recurrence rules, bills, agenda view | Property tests pass; your real bills show correct due dates | 1 week |
| **4** | Payments: **Alpha 1** | Mark paid, voiding, history, partial payments, auto-pay recording, calendar view, the image published on tags, a generated changelog | History invariance test passes; **you run your real bills on it for a full billing month** with no status errors | 1 month |
| **5** | Accounts and bill import | Payment accounts, CSV import, importing bills from v1 | Your v1 bills import correctly, ready to review | 1 week |
| **6** | Sharing | Shared spaces, invites, roles | Two-person household tested for real; private bills stay private | 2 weeks |
| **7** | Reminders | Notifications, push, PWA install | Reminders arrive on the correct local day across time zones | 2 weeks |
| **8** | Account security | TOTP, backup codes, session management | Lost-device recovery path tested | 1 week |
| **9** | Insights | Overview page, income, then the statistics you actually use | Totals match the data in tests | 2 weeks |
| **10** | Administration and SSO | Users, settings, job status, Google and Microsoft sign-in | Works on a clean install | 1 week |
| **11** | Cutover and Beta | Optional read-only archive of v1 payments, security review, retire v1 | Household running on v2 only; archived payments appear in no report | 1 month |

## Why this order

```
base -> categories -> bills -> payments -> accounts, import -> sharing -> reminders -> ...
```

- **Categories comes first** because it's small and has no date logic, so it tests the process cheaply.
- **Bills and payments come before everything else** because most other features depend on them, and they hold the riskiest logic.
- **Sharing is a feature but its foundation isn't.** Spaces and roles are in the base from day one, so turning on sharing later doesn't mean rewriting queries.
- **Statistics come late** because they only read data, and can't be correct until that data is.

## Deliberately not planned

Each of these needs a spec and a place in this roadmap before any work starts.

- Household browsing (dropped for privacy)
- Drag-and-resize dashboard widgets
- Maintenance mode and retention settings
- Demo mode
- Budgets, bank connections, native apps, multi-currency
