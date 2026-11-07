#!/bin/sh
# Saves the database to a file. From the repo root: sh deploy/backup.sh [folder]
#
# The file holds everything in Remidy, so keep it private and copy it to another machine. It doesn't
# include ENCRYPTION_KEY or AUTH_SECRET: keep your .env safe separately.
set -eu

folder="${1:-backups}"
compose="${REMIDY_COMPOSE:-docker compose -f deploy/compose.yaml --env-file .env}"

# Only the owner can read what's created from here on.
umask 077
mkdir -p "$folder"
file="$folder/remidy-$(date -u +%Y-%m-%dT%H-%M-%SZ).dump"
partial="$file.partial"
trap 'rm -f "$partial"' EXIT

$compose exec -T db pg_dump --username=remidy --dbname=remidy --format=custom >"$partial"

# A backup that can't be read is worse than none, because it looks like one.
$compose exec -T db pg_restore --list <"$partial" >/dev/null

mv "$partial" "$file"
echo "Saved $file"
