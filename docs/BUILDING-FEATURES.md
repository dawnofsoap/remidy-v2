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
| 3. Data and API | Migration, contracts, repo, routes, permission tests | Integration tests pass, and breaking each rule on purpose fails a test |
| 4. UI | Screens built from the shared UI kit, behind a feature flag, and turned on in `compose.yaml` for development | Loading, empty, error and mobile states all work |
| 5. End to end | One test covers the main journey, and `sampleData` adds fictional examples of the feature | Passes in CI |
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
    ├── routes.ts         HTTP only: validate, call the repo or service, respond
    ├── service.ts        only when there's a workflow beyond the queries, such as several steps
    ├── repo.ts           the only file with queries for this feature's tables, and their transactions
    ├── jobs.ts           background jobs, if any; add them through `jobs` in defineFeature
    └── payments.test.ts

apps/web/src/
├── ui/                   shared UI kit; knows nothing about bills
└── features/payments/
    ├── index.ts
    ├── pages/            thin: layout and data loading, if the feature has its own pages
    ├── components/
    └── api.ts            calls the API through `apiRequest` in core/session.ts
```

A feature plugs in at one line, in `features/index.ts`:

```ts
export const features: Feature[] = [categories, bills, payments];
```

On the server, a feature is a list of routes. `defineRoute` is the only way to add one, and the server refuses to start if a route is added any other way:

```ts
export const payments = defineFeature({
  name: 'payments',
  flagged: true, // off until named in ENABLED_FEATURES
  routes: ({ database }) => [
    defineRoute({
      method: 'POST',
      url: '/api/v1/payments',
      access: 'signed-in',
      body: createPaymentRequest, // Zod schemas from @remidy/contracts
      response: paymentResponse,
      status: 201,
      handler: ({ body }) => service.record(database, body),
    }),
  ],
});
```

- **Space routes say the role they need**, such as `access: { space: 'manager' }`, with `:spaceId` in the URL. The handler gets the checked space as `space`, and every query must be scoped to `space.id`. Someone who isn't a member gets "not found", so they can't tell the space exists.
- **Access is checked first**, before input is validated, so a caller without access learns nothing from error messages. Anything that isn't public is refused until the access check allows it.
- **Responses are filtered.** A field missing from the response schema never reaches the client, so adding a column can't leak it.
- **Every route's access is listed** in `ROUTE_ACCESS` in `permissions.test.ts`. A new route, or a change to what one needs, fails a test until the list matches. The other permission tests check each route against what it declares, so without this list a route that asks for too little would pass them. A public route must also be added to `PUBLIC_ROUTES`.
- **The permission test turns on every flagged feature**, so a route is checked before anyone enables it.

A web feature lists its routes and navigation links, and a flagged one stays out of navigation until the server reports it as enabled:

```ts
export const payments = defineFeature({
  name: 'payments',
  flagged: true,
  routes: [createRoute({ getParentRoute: () => rootRoute, path: '/payments', component: PaymentsPage })],
  nav: [{ to: '/payments', label: 'Payments', icon: Wallet }],
});
```

A feature that has a shared list, such as categories, adds a section through `spaceSettings` instead of a page. It
appears in Household, or in Settings for someone without a household, and the section calls `useSettingsSpace()` to
know which space it's about. See "Where things live" in `DESIGN.md` for which area holds what.

### Sample data

Each feature adds its own fictional data through `sampleData` in its definition, using its own repo functions so the
data follows the same rules as real data. It must be safe to run again without adding anything twice.
Show what the screens need to handle, such as empty fields, long names and every state. Never use real data: the repo is
public.

### Migrations

- **Stop the dev server first.** It restarts whenever a source file changes and applies new migrations as it
  starts, never applying the same file twice. A migration it finds half-written stays half applied, which happened
  twice while building Categories and Bills. Run `docker compose stop server`, change `schema.ts`, run
  `pnpm db:generate`, add any SQL it can't write such as triggers, then `docker compose start server`.
- **Data every space needs comes from the database.** The starter categories are added by a trigger when a space is
  created, so no way of creating a space can miss them.

### Packages

- **A new workspace package for the server also goes in `deploy/Dockerfile`**, which copies only what it names. The
  `production-image` check fails if one is missing, because the server can't start.

### Tests in a real browser

- **Mocked tests** go in their own file and use `mockSignedIn` from `e2e/support.ts`. They run at desktop and phone
  sizes.
- **The main journey on the real stack** goes in `auth.stack.spec.ts`, which runs once against a new database, in
  order. Add the feature's journey before the tests that change the password. It can switch to a phone size itself.
- **Never hard-code an address.** Use the configured `baseURL`, so the tests can run against a copy of the stack.

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
| Request and response shapes validated | `defineRoute` requires a response schema and validates what it's given; the server refuses to start with a route added any other way; server features can't import Fastify |
| Permissions always checked | Every route must declare its access, and non-public routes are refused by default. A test walks every real route against a real database: public ones must be on a known list, and the rest must refuse anonymous callers, non-members and members with too low a role |
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

## Secrets and history

- **Stored secrets** go through `createEncryptor` in `core/encryption.ts`, with a context naming what the secret belongs to, such as `mfa:<user id>`. Never store one any other way.
- **Changes to anything with history** call `recordActivity` in `core/activity.ts` inside the same transaction as the change. It takes only a transaction, so it can't be separated from the change by accident. It refuses fields that look like secrets, and the database refuses to update or delete what's been recorded.

## API versions

Every route is under `/api/v1/`, including sign-in at `/api/v1/auth/`. `defineRoute` won't accept anything else, and the permission test checks the whole app. The one exception is `/api/health`, which describes the server rather than the API, so Docker and proxies don't depend on the version.

Adding to `v1`, such as a new route or an optional field, needs no new version. A change that would break a copy of the app already running on someone's device, such as removing a field, needs a new one.

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

- **Active:** CI checks, Conventional Commit titles, dependency directions, date, money and raw-control bans, file size, accessibility lint, frozen lockfile, Dependabot, secret scanning, design token lint and contrast checks, axe and keyboard checks in a real browser, migration checks, route schemas and the anonymous access test, GitHub blocking merges on high-severity CodeQL alerts, the domain coverage threshold, the production image test.
- **Arrive in milestone 4:** the history invariance test, generated versions and changelog.
