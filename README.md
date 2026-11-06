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
