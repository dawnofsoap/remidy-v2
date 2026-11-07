# Remidy v2: Design

| | |
|---|---|
| **Status** | Draft for review |
| **Updated** | 2026-11-06 |
| **Repository** | `remidy-v2` (public), development on `alpha` |
| **Companions** | [How features get built](docs/BUILDING-FEATURES.md), [Roadmap](docs/ROADMAP.md) |

## 1. Summary

Remidy tracks recurring bills and payments for individuals and households. It's self-hosted and runs with Docker.

v2 is a rebuild focused on stability. v1 gained many features quickly, without an agreed foundation or a
repeatable way to add to it, and that led to persistent bugs and history that couldn't be trusted. v2
reverses the order: **build and prove a small base, then add features one at a time through a process that
keeps the app stable.**

**Remidy doesn't move money.** "Auto-pay" means recording that a bill pays itself.

## 2. Lessons from v1

| What happened | What v2 does |
|---|---|
| Declared finished within about a week, then features kept arriving | A roadmap with exit tests; nothing is "done" until it has been used for real |
| Core concepts such as due dates were redesigned after features relied on them | Model them first, and test them before any UI exists |
| Huge commits touching over 100 files | Small, single-purpose pull requests |
| Production build broke repeatedly after pushing | CI must pass before anything merges |
| Paid status guessed from date windows that varied by screen | Each payment settles one stored due date |
| Past reports changed when a bill was edited or deleted | History is recorded as it happened and stays fixed (section 6) |
| Date logic repeated on the server and the client | One shared `domain` package; the server decides what is due |
| Pages grew past 3,000 lines | Feature folders with file-size limits |
| Shared components existed, but nothing required their use | Lint rules require the UI kit |
| Very few tests, none on the riskiest logic | Riskiest logic is tested first |

## 3. Goals

- **History can be trusted.** What was due and what was paid never changes because of a later edit.
- A bill's status is always exact and explainable.
- Adding a feature doesn't require changing existing features.
- Mistakes are caught by tools before they merge.
- Self-hosting takes one app image plus Postgres.
- Answers "what's due, what's overdue?" in seconds, on phone and desktop.

**Not in v2.0:** moving money, bank connections, full budgeting, multi-currency, native apps, hosted SaaS operations.

## 4. Architecture

```
remidy-v2/
├── apps/
│   ├── web/            React PWA: ui/ kit plus features/
│   └── server/         API and jobs: core/ plus features/; serves the built web app
├── packages/
│   ├── domain/         Pure logic: dates, money, recurrence, status. No I/O.
│   ├── contracts/      Request and response schemas shared by web and server
│   └── db/             Schema, migrations, database connection
├── deploy/             Dockerfile, Compose file
└── docs/
```

```
Browser (PWA) --HTTPS + cookie--> server --> Postgres
     |                              |
     +----- contracts, domain ------+
                                    +-- job runner, also stored in Postgres
```

### Stack

Chosen for current standards, strong type safety from database to screen, and little to operate alone.
Pin exact versions when scaffolding.

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node.js 26 LTS | Current LTS line, with `Temporal` built in |
| Language | TypeScript, strict | Money, dates and roles benefit most from types |
| Repo | pnpm workspaces | Shared packages without extra tooling |
| Web | React 19, Vite | A maintained, fast standard for an app behind a login |
| Routing | TanStack Router | Type-safe routes and validated URL parameters, which suits an SPA |
| Server state | TanStack Query | Caching and refetching without hand-written loading state |
| Forms | React Hook Form with Zod | Same schemas as the API |
| UI | Tailwind CSS v4, shadcn/ui | Accessible components that live in this repo and can be fully restyled |
| PWA | vite-plugin-pwa | Maintained service worker and manifest setup |
| API | Fastify 5 with Zod | Strong fit for a standalone Node API, with built-in structured logs |
| Database | PostgreSQL 18 | Current stable release; move to 19 after it has settled |
| Data access | Drizzle | SQL-first typed queries, with migrations as reviewable SQL |
| Auth | Better Auth | Sessions, TOTP, passkeys and OIDC from a maintained library |
| Jobs | pg-boss | Retries and restart safety with no Redis |
| Dates | Temporal | Native on the server; polyfilled in the browser until Safari supports it |
| Lint and format | ESLint, typescript-eslint, Prettier | Custom and type-aware rules are central to the process |
| Boundaries | dependency-cruiser | Fails CI when a feature imports across the rules |
| Tests | Vitest, fast-check, Testcontainers, Playwright | Property tests suit recurrence; integration tests use real Postgres |
| CI and releases | GitHub Actions, GHCR, CodeQL, Dependabot | All built into the public repo |
| Deploy | One Node image plus Postgres; TLS at the user's reverse proxy | Few moving parts |

### Alternatives considered

| Alternative | Why not |
|---|---|
| Next.js or another full-stack framework | No search traffic to serve behind a login, and long-running jobs and self-hosting are simpler with a plain server |
| Hono | Excellent for edge and multi-runtime hosting, which this app doesn't need |
| Prisma | Also good; Drizzle stays closer to SQL, which matters for occurrences and reports |
| Hand-written auth | Too much security-critical code to own in a public project |
| Biome or Oxlint alone | Faster, but custom and type-aware rules are what enforce the process; can be added later for speed |

## 5. The base

The base is everything a feature needs but shouldn't build itself. It contains **no bill features**. If it
isn't on this list, it's a feature and waits its turn.

| Area | Included |
|---|---|
| **Sign-in** | Admin account created on first start, sign in and out, password change and reset, revocable sessions, rate limits and lockout |
| **Spaces and roles** | Personal space per user, memberships, one permission check, enforced on every route |
| **API conventions** | `defineRoute` with required schemas, one error format, request IDs, pagination |
| **Database** | Migrations, connection handling, test database setup |
| **Foundations** | Validated config that refuses to start on missing secrets, structured logs, health checks, encryption helper for stored secrets, activity log |
| **Jobs** | Job runner with retries and a visible status, running a heartbeat job |
| **Dates and money** | `domain` types for calendar dates, time zones and integer cents |
| **Design system** | Neutral tokens, light and dark themes, contrast checks in CI |
| **Web shell** | Navigation, routing, auth handling, responsive layout, error boundary |
| **UI kit** | Button, inputs, select, date picker, money input, modal, list, toast, and loading, empty and error states |
| **Feature system** | `defineFeature`, feature flags, the registration list |
| **Delivery** | CI, branch rules, a production image tested in CI, tested backup and restore |

### Base exit test

The base is finished when all of these are true:

- A fresh clone runs with one command, and the production image runs behind TLS in CI.
- Someone can sign in as admin, choose a password, and see an empty app shell on phone and desktop.
- The app refuses to start on missing or default secrets.
- Repeated failed logins are throttled.
- A request for another space's data is rejected, and a test covers every registered route.
- A deliberately rule-breaking pull request is blocked by CI.
- A backup restores to a working app.
- A job that fails is retried and its failure is visible.
- Automated accessibility checks pass on every shell and UI kit screen.

### Moved out of the base

These were planned for the base, but have nothing to work with until there are real features.

- **Publishing the image on tags, and a generated changelog,** arrive with Alpha 1 (milestone 4), the first
  version anyone runs for real.
- **Seed data** grows with the features that need it, starting with Categories. It stays fictional.

## 6. Data model

### Spaces

```
users --< memberships >-- spaces --< bills, accounts, categories, income
```

- Every user gets a **personal space**. A household is a **shared space**.
- `memberships(user_id, space_id, role)` is the only source of space roles: `owner`, `manager` or `member`.
- Client-editable preferences are a strict schema, separate from roles.
- `users.is_instance_admin` manages the instance and grants no access to bills.
- A private bill is a bill in the personal space.
- The schema allows several shared spaces per user; the v2.0 UI assumes one.

### Bills, occurrences, payments

```sql
bills (
  id uuid PRIMARY KEY, space_id uuid NOT NULL,
  name text NOT NULL, category_id uuid, default_account_id uuid, assignee_id uuid,
  expected_cents bigint NOT NULL, is_variable boolean NOT NULL,
  rule jsonb NOT NULL,     -- {"freq":"month","interval":1,"anchor":"2026-01-31"}
  ends_on date, autopay boolean NOT NULL, url text, notes text, archived_at timestamptz
)

bill_occurrences (
  id uuid PRIMARY KEY, bill_id uuid NOT NULL REFERENCES bills ON DELETE RESTRICT,
  due_on date NOT NULL,
  bill_name text NOT NULL,          -- copied: the record of what this occurrence was
  category_id uuid,                 -- copied
  expected_cents bigint NOT NULL,   -- copied
  state text NOT NULL,              -- open | settled | skipped
  UNIQUE (bill_id, due_on)
)

payments (
  id uuid PRIMARY KEY,
  occurrence_id uuid REFERENCES bill_occurrences ON DELETE RESTRICT,
  paid_on date NOT NULL, amount_cents bigint NOT NULL,
  account_id uuid REFERENCES accounts ON DELETE RESTRICT, paid_by uuid,
  source text NOT NULL,             -- manual | autopay | v1_archive
  confirmation text, notes text,
  voided_at timestamptz, voided_by uuid, void_reason text
)
CREATE UNIQUE INDEX one_autopay_per_occurrence
  ON payments (occurrence_id) WHERE source = 'autopay' AND voided_at IS NULL;

activity_log (
  id uuid PRIMARY KEY, space_id uuid NOT NULL, actor_id uuid,
  entity text NOT NULL, entity_id uuid NOT NULL, action text NOT NULL,
  before jsonb, after jsonb, created_at timestamptz NOT NULL
)
```

- **Overdue** is derived: `state = 'open'` and `due_on` is before today in the space's time zone.
- **Generation:** a daily job keeps occurrences 13 months ahead, and can safely re-run because of the `UNIQUE` constraint.
- **Month-end dates** always come from the anchor, so Jan 31 gives Feb 28 and then Mar 31.
- **Partial payments** are allowed. An occurrence settles when payments reach the expected amount; a variable bill settles on its first payment.
- **Duplicate auto-pay** is prevented by the database index, whichever code path runs.

### History rules

These apply from the first bill, and tests enforce them.

1. **Past occurrences are never rewritten.** Editing a bill changes only future `open` occurrences.
2. **Reports read the records, not the current bill.** Name, category and expected amount come from the occurrence.
3. **Paying never changes the bill.** A variable bill's actual amount lives on the payment.
4. **Corrections are visible.** A wrong payment is voided and replaced, keeping the original and the reason.
5. **Anything with history is archived, not deleted.** Bills, accounts and categories with history can only be archived; the database refuses the delete.
6. **Every change is logged.** Changes to bills, occurrences and payments go in the activity log, in the same transaction.
7. **Totals have one definition.** "Due" counts by `due_on`, "paid" counts non-voided payments by `paid_on`, and every screen uses the same queries.

The key automated test is **history invariance**: generate random bills and payments, record the reports,
apply random edits and archives, and confirm that every past period's report is unchanged.

### Time and money

- Due dates are `date` values with no time zone. `spaces.timezone` defines "today".
- Jobs run per space at local time.
- The server computes all occurrences and status; the browser displays them.
- Money is integer cents in the database, API and domain package, and is formatted only for display.

## 7. Security requirements

The repo is public, so assume anyone can read this code. These are part of the base and are tested.

- Sessions in httpOnly, Secure, SameSite cookies with CSRF protection
- Memory-hard password hashing, login rate limits and lockout
- Same-origin by default, with strict security headers
- Secrets required at startup, with no fallback values
- Any stored secrets, such as MFA keys and provider credentials, encrypted at rest
- Small JSON body limit; uploads use a separate path with size and type checks
- Spaces are invite-only, and space names are never listed to non-members
- `SECURITY.md` with a private reporting route, plus Dependabot, CodeQL and secret scanning from day one
- Only fictional seed data in the repo

## 8. Visual design

The layout is settled: a sidebar on desktop, bottom navigation on phones, and an agenda that leads with what's left to pay this month. **The final colors and style are still open.** The app uses neutral grays with color only for status until that's decided, because all colors live in `apps/web/src/ui/tokens.css` and changing them later is a small edit.

- **Direction:** clean and calm, with plenty of space, clear type, and color reserved for meaning such as overdue or paid.
- **Mobile first:** bottom navigation and large touch targets on phones, and a sidebar on desktop.
- **Themes:** light and dark from the first screen, built on semantic tokens such as `surface` and `danger`.
- **Accessibility:** WCAG 2.2 AA, full keyboard use, and respect for reduced-motion settings. CI checks every token pair for contrast, so a color that fails can't merge. Status is never shown by color alone.
- **Every state is designed:** loading, empty and error, not only the populated screen.
- **Motion and detail:** subtle, and only where it explains a change.

## 9. Moving from v1

v1's payment history isn't reliable enough to treat as fact, so v2 **starts its history fresh**.

| v1 data | In v2 |
|---|---|
| Bills, categories, payment accounts | Imported as setup data, then reviewed by the owner |
| Users and households | Recreated; people sign in fresh and set up MFA again |
| Payment history | Optional read-only archive, clearly labeled as unverified and excluded from all reports |

Occurrences begin at the cutover date, so every reported figure in v2 comes from v2's own records. Archived
payments use `source = 'v1_archive'`, have no occurrence, and appear only on a dedicated archive view.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Base work drags on with nothing visible | The base list is fixed and has an exit test; anything else is a feature |
| Old habits return under pressure | Tools enforce the rules; the backlog catches new ideas |
| Process feels heavy for one person | Milestone 2 tests it on a small feature; change whatever doesn't help |
| Rebuild stalls before matching v1 | Alpha 1 replaces v1 for your own bills at milestone 4, not at the end |
| Stored occurrences add complexity | Small state model, one generator, tests before UI |
| Young dependencies change quickly (Drizzle before 1.0, Better Auth) | Pin versions, keep access behind `repo.ts` and `core`, and let Dependabot propose upgrades |

## 11. Open decisions

| # | Decision | Default until decided |
|---|---|---|
| 1 | Is this always self-hosted, or a possible public service later? | Self-hosted, with spaces ready for more |
