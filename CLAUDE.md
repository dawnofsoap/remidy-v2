# Working in this repo

Read `docs/BUILDING-FEATURES.md` before changing code. Those rules apply to every change. `DESIGN.md` covers
the architecture and `docs/ROADMAP.md` shows the current order of work.

- Work on one milestone or feature at a time. Put new ideas in a `backlog` issue.
- Use a short-lived branch and a pull request into `alpha`, even though the signed-in account can bypass that rule. The bypass is for the owner.
- Merge your own pull request once CI passes, unless it is risky (see "Review of risky changes" in `docs/BUILDING-FEATURES.md`). Leave risky pull requests open for the owner.
- Keep pull requests to one purpose. Titles follow Conventional Commits.
- Run `pnpm check` before pushing. It runs format, lint, boundaries, typecheck and tests.
- A bug fix starts with a failing test.
- When changing a lint or boundary rule, update `tooling/rule-tests` to match.

## This repo is public

Never commit secrets, real financial data, private notes, or details about any deployed instance. `notes/` is
gitignored and must stay that way.
