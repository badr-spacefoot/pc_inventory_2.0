#!/usr/bin/env bash
set -euo pipefail
umask 077
# Run from the isolated parc stack during a verified write freeze.
# RESTIC_REPOSITORY must be an encrypted off-host repository, initialized separately.
: "${RESTIC_REPOSITORY:?Configure off-host restic repository}"
: "${RESTIC_PASSWORD_FILE:?Configure owner-readable restic password file}"
test "${INVENTORY_WRITES_FROZEN:-}" = true || { echo 'Freeze all app/collector/job writers first'; exit 1; }
case "$RESTIC_REPOSITORY" in rest:http://*|s3:http://*) echo 'Encrypted backup transport required'; exit 1 ;; esac
case "$RESTIC_REPOSITORY" in sftp:*|s3:*|b2:*|azure:*|gs:*|rclone:*|rest:https:*) ;; *) echo 'Off-host repository required'; exit 1 ;; esac
test -f docker-compose.yml && test -f compose.parc.yml && test -d volumes/storage
command -v restic >/dev/null
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
docker compose -p parc -f docker-compose.yml -f compose.parc.yml exec -T db \
  pg_dump -U postgres -d postgres -Fc > "$scratch/database.dump"
test -s "$scratch/database.dump"
docker compose -p parc -f docker-compose.yml -f compose.parc.yml exec -T db \
  pg_dumpall -U postgres --roles-only > "$scratch/roles.sql"
tar -cf "$scratch/storage.tar" -C volumes storage
(cd "$scratch" && sha256sum database.dump roles.sql storage.tar > SHA256SUMS)
restic backup --tag spacefoot-parc --tag consistent-freeze \
  "$scratch" volumes/functions docker-compose.yml compose.parc.yml .env inventory-api.env site Caddyfile.static
restic check
echo 'Backup and repository check complete. A separate isolated restore test is still required.'
