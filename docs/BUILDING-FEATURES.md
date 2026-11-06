# How features get built

v1 grew by adding each new idea straight into the app, and the bugs came with it. These rules exist to
stop that, and wherever possible a tool enforces them, because rules that rely on memory stop being
followed when you're busy.

## The core rules

1. **One feature at a time.** The next one starts only when the current one is done.
2. **Spec before code.** Every feature starts with a one-page spec from [the template](features/TEMPLATE.md).
3. **Bugs before features.** An open P0 or P1 bug blocks new feature work.
4. **New ideas go to the backlog.** An idea that comes up mid-build becomes an issue and doesn't change the current scope.
5. **A bug fix starts with a failing test.** The test stays, so that bug can't quietly return.
6. **The base changes separately.** If a feature needs something new in the base, change the base in its own pull request first.

## The path of a feature

| Step | What happens | Moves on when |
|---|---|---|
| 1. Spec | Fill in the template, keeping it to one page | Scope and edge cases are written down |
| 2. Rules | Write domain logic and its tests, with no UI or database | Tests pass |
| 3. Data and API | Migration, contracts, service, routes, permission tests | Integration tests pass |
| 4. UI | Screens built from the shared UI kit, behind a feature flag | Loading, empty, error and mobile states all work |
| 5. End to end | One test covers the main journey | Passes in CI |
| 6. Stabilize | Turn the flag on and use the feature for real | The period in the roadmap ends with no open P0 or P1 |
| 7. Release | Tag a version, update the changelog, and remove the flag | Published |

Each step can be its own small pull request. Unfinished work can merge safely because the flag keeps it hidden.

## Bug severity

| Level | Meaning | Response |
|---|---|---|
| **P0** | Data loss or corruption, a security hole, or the app is unusable | Stop everything and fix it |
| **P1** | Wrong money or wrong status, or a main workflow is broken | Fix before any new feature work |
| **P2** | Annoying, with a workaround | Schedule it; cap the list at 10, and clear it before adding more features |
| **P3** | Cosmetic | Backlog |

## Where code goes

Each feature is a folder. Adding one should mean adding folders and registering them, not editing other features.

```
apps/server/src/
├── core/                 base only; never imports from features/
└── features/payments/
    ├── index.ts          public interface: the only file other features may import
    ├── routes.ts         HTTP only: validate, call the service, respond
    ├── service.ts        workflows and permission checks
    ├── repo.ts           the only file with queries for this feature's tables
    ├── jobs.ts           background jobs, if any
    └── payments.test.ts

apps/web/src/
├── ui/                   shared UI kit; knows nothing about bills
└── features/payments/
    ├── index.ts
    ├── pages/            thin: layout and data loading
    ├── components/
    └── api.ts
```

A feature plugs in at one line:

```ts
export const features = [categories, bills, payments];
```

```ts
export const payments = defineFeature({
  name: 'payments',
  routes,
  jobs,
  nav: [{ label: 'Payments', path: '/payments' }],
});
```

### Dependency direction

```
features -> core -> packages (domain, contracts, db)
```

- `core` never imports from a feature.
- A feature imports another feature only through its `index.ts`, and cycles aren't allowed.
- Each feature owns its tables, and other features read them through its public interface.
- Reusable features such as notifications know nothing about their callers. Payments calls `notify()`; notifications never imports payments.

## What enforces the rules

| Rule | Enforced by |
|---|---|
| Types, lint, tests and production build pass before merging | Required CI checks, branch protection |
| Changes reach `alpha` and `main` only through pull requests that pass CI, and history is never rewritten | GitHub rulesets with no bypass; no second approval is required, since this is a solo project |
| Dependency directions above | dependency-cruiser, failing CI |
| SQL only in `repo.ts` and `packages/db` | Lint rule |
| Request and response shapes validated | Routes must declare a contract schema; `defineRoute` won't accept one without |
| Permissions always checked | Space-scoped routes get the space from middleware; a test walks every registered route and requires a rejection |
| Dates and money go through `domain` | Lint bans `new Date()` and `parseFloat` in feature code, with named exceptions |
| Modals, forms and buttons come from `ui/` | Lint bans the raw patterns outside `ui/` |
| Files stay small | Lint `max-lines`: fail above 500 lines |
| Colors come from design tokens and meet WCAG contrast | Tailwind theme limited to tokens; lint bans hex colors, arbitrary color classes and `!important`; a test checks every token pair |
| Accessibility basics hold | jsx-a11y lint rules and axe checks in Playwright |
| Domain logic is well tested | CI coverage threshold on `packages/domain` |
| History stays fixed | History invariance test in CI; database refuses to delete anything with history |
| Database changes are safe | Migrations are forward-only and apply all or none; tests run them on a real, empty database; CI fails if `schema.ts` has changes with no migration. Testing against the last release's schema starts with the first release |
| Versions and changelog | Generated from tags and commit messages; no version commits |
| Dependencies stay consistent | Frozen lockfile in CI |
| No secrets or real data committed | GitHub secret scanning and push protection; seed data is fictional |

## Review of risky changes

Most pull requests merge once CI passes. These stay open until the owner has reviewed them:

- Sign-in, sessions, permissions or anything else security-related
- Database migrations that change or remove existing data
- The history rules, or how money and status are calculated
- Anything that could expose private data, including logs and exports
- Repository settings, rulesets, CI permissions and release publishing
- A new dependency with broad access, or a major version upgrade of a core one
- Anything else that surprised the author or was hard to test

The pull request says why it was flagged and what to look at.

## Pull request rules

- One purpose per pull request, under about 400 changed lines where practical (generated files excluded).
- Commit messages follow Conventional Commits, for example `fix(payments): reject negative amounts`.
- Each pull request links its issue and says how it was tested. Review your own diff before merging, even working solo.
- Squash merge, so `alpha` history reads as a list of complete changes.

## Branches

- `alpha`: the integration branch until the first stable release. It should always build.
- `feature/<name>` and `fix/<name>`: short-lived branches off `alpha`.
- `main`: created at the first stable release. Until then, tag alpha versions on `alpha`.

## Using v1

Read v1 to learn what a feature should do. Don't copy its code or styles across. Record useful behavior
and known bugs under "Lessons from v1" in the spec, so each bug becomes a test. Check the license of any
asset before bringing it over, because this repo is public; bank and card artwork needs particular care.

## What is enforced today

The table above is the target. Some rules need code that doesn't exist yet.

- **Active:** CI checks, Conventional Commit titles, dependency directions, date, money and raw-control bans, file size, accessibility lint, frozen lockfile, Dependabot, secret scanning, design token lint and contrast checks, axe and keyboard checks in a real browser, migration checks, GitHub blocking merges on high-severity CodeQL alerts.
- **Arrive in milestone 1:** contract schemas on routes, the permission test across all routes, domain coverage threshold, generated versions and changelog.
- **Arrive in milestone 4:** the history invariance test.
