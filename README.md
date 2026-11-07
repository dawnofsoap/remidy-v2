# Remidy

Self-hosted bill tracking for individuals and households.

> **Status: early development.** There's no usable app yet, only the project skeleton. Features arrive
> milestone by milestone, following the [roadmap](docs/ROADMAP.md).

Remidy shows what's due, what's overdue and what's been paid, with a history you can trust. It records
payments and doesn't move money.

## Run it locally

You only need [Docker](https://www.docker.com/products/docker-desktop/):

```
docker compose up
```

Then open http://localhost:5173. The page should say the server and database are running. Code changes
reload automatically. To stop, press Ctrl+C. To also delete the development database and installed
packages, run `docker compose down -v`.

The first start creates the admin account, `admin@remidy.local`, and prints its password. Find it with
`docker compose logs server`, sign in at http://localhost:5173, and choose your own password.

The password is only printed once, and `docker compose down` deletes those logs. If it's ever lost, this
prints a new one and signs the admin out everywhere:

```sh
docker compose exec server pnpm --filter @remidy/server reset-admin-password
```

In development, password reset emails are printed to the same console instead of being sent.

If new packages were added since you last started it, restart with `docker compose down` and then
`docker compose up`. Otherwise the running server can't find them.

## Sample data

To see how screens look with something in them, fill the development database with fictional data:

```sh
docker compose exec server pnpm --filter @remidy/server sample-data
```

It adds a household, The Example Household, with a made-up second member who can't sign in, and bills of every kind:
personal and shared, fixed and varying, auto-pay, overdue, ending and archived. Dates count from today, so the data
always looks current. Running it again adds nothing new, and `--fresh` replaces the sample data. Anything else in the
database is left alone. It refuses to run in production.

## Running it for real

Remidy runs as one image plus Postgres, behind a reverse proxy of your choice that handles TLS.

1. Copy `.env.example` to `.env` and fill it in. Back up `ENCRYPTION_KEY` somewhere other than the database.
2. Run `docker compose -f deploy/compose.yaml --env-file .env up --detach --build`.
3. Point your proxy at `127.0.0.1:3000`, and set `TRUST_PROXY` to the proxy's address.
4. Read the first admin password with `docker compose -f deploy/compose.yaml --env-file .env logs server`.

If that password is ever lost:

```sh
docker compose -f deploy/compose.yaml --env-file .env exec server node apps/server/src/core/auth/reset-admin-password.ts
```

### Backups

```sh
sh deploy/backup.sh
```

This saves everything in Remidy to a file in `backups/`, readable only by you. Run it on a schedule with cron, and
copy the files to another machine, because a backup on the same disk won't survive losing that disk. Nothing deletes
old backups for you.

**Keep your `.env` safe separately.** Backups don't include it, and stored secrets can't be read without
`ENCRYPTION_KEY`.

To restore one, with the app running:

```sh
sh deploy/restore.sh backups/remidy-2026-01-31T03-00-00Z.dump
```

A damaged file changes nothing, because the backup loads into a separate database first. The app restarts on the
restored data, which logs everyone out only if `AUTH_SECRET` has changed. What it replaced stays in a database named
`remidy_before_restore` until the next restore, so it's still on disk: to remove it, run
`docker compose -f deploy/compose.yaml --env-file .env exec db dropdb -U remidy remidy_before_restore`.

## Contributing checks

To run the checks on your own machine, install Node 26, pnpm and Docker, then:

```
pnpm install
pnpm check
```

## Project documents

- [Design](DESIGN.md): architecture, data model and the base
- [How features get built](docs/BUILDING-FEATURES.md): the rules every feature follows
- [Roadmap](docs/ROADMAP.md): milestones and their exit tests
- [Security policy](SECURITY.md): how to report a vulnerability

## License

[MIT](LICENSE)
