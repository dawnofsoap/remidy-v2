#!/bin/sh
# Replaces the database with a backup. From the repo root: sh deploy/restore.sh <file>
#
# The backup loads into a separate database first, so a bad file changes nothing. The data it replaces
# is kept as remidy_before_restore until the next restore, in case this was a mistake.
set -eu

file="${1:-}"
compose="${REMIDY_COMPOSE:-docker compose -f deploy/compose.yaml --env-file .env}"

if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "Usage: sh deploy/restore.sh <backup file>" >&2
  exit 1
fi

sql() {
  $compose exec -T db psql --username=remidy --dbname=postgres --quiet --set=ON_ERROR_STOP=1 --command="$1"
}

server_stopped=no
finish() {
  status=$?
  [ "$status" -eq 0 ] || sql 'DROP DATABASE IF EXISTS remidy_restoring' || true
  [ "$server_stopped" = no ] || $compose start server
  exit "$status"
}
trap finish EXIT

sql 'DROP DATABASE IF EXISTS remidy_restoring'
sql 'CREATE DATABASE remidy_restoring TEMPLATE template0'
if ! $compose exec -T db pg_restore --username=remidy --dbname=remidy_restoring --no-owner \
  --exit-on-error <"$file"; then
  echo "That backup couldn't be restored. Nothing was changed." >&2
  exit 1
fi

$compose stop server
server_stopped=yes
sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'remidy' AND pid <> pg_backend_pid()" >/dev/null
sql 'DROP DATABASE IF EXISTS remidy_before_restore'
sql 'ALTER DATABASE remidy RENAME TO remidy_before_restore'
sql 'ALTER DATABASE remidy_restoring RENAME TO remidy'

echo "Restored $file. The previous data is in remidy_before_restore until the next restore."
