# Isolated parc deployment kit

Prepared locally; no server provisioning or cutover has been performed. This overlay targets the official Supabase `self-hosted/v0.8.1` Docker tree inspected on 2026-09-15, including PostgreSQL 17 and its `api-gw` service. `upstream.lock.json` pins the resolved commit and Compose file hash. It is not a replacement for that tree. The shared VPS currently fails the capacity gate.

Updated 2026-11-06: the shared disk is 96% full with 3.3 GB available. The current overlay and pinned official source render successfully offline (12 services, no host ports); Caddy configurations adapt on the existing 2.11.9 binary. The web image is pinned to that observed image digest. Preflight also rejects default platform secrets, invalid legacy API keys, reused application credentials and wildcard CORS. See the [current release readiness record](../../docs/operations/2026-11-06-release/README.md) for measured results and outstanding capacity, signing, restore and publication requirements. No services were started.

## Build a release

Run the pinned package manager, frozen install and full quality gate. Set `IT_INVENTORY_API_URL=https://parc-api.piqa.fr/functions/v1/inventory-api` and the public script/download URLs, then run `node scripts/package-site.mjs dist/site --target=vps`. This target check rejects an API URL that would conflict with the supplied CSP. Output must be a new/empty directory. Packaging publishes only static assets and documented fallback collectors, generates public runtime config, and stamps script/style URLs with content hashes. It excludes deployment/import scripts and source trees.

## Stage after capacity is available

1. Obtain and pin the official Supabase `self-hosted/v0.8.1` tree in a new `/srv/spacefoot-parc` directory. Record its resolved commit and image digests. Use its key-generation instructions privately, set unique secrets and use PostgreSQL 17; never launch placeholder defaults.
2. Copy `compose.parc.yml`, `Caddyfile.static`, packaged `site/` and the current function source to the matching official `volumes/functions/inventory-api` location. Copy `inventory-api.env.example` to `inventory-api.env`, fill it securely and chmod 600. Preserve the official `main` function dispatcher. Configure external Supabase URLs as `https://parc-api.piqa.fr`, site URL as `https://parc.piqa.fr`, and test signed Storage links. Internal API URLs stay on the dedicated backend network.
3. Create only the dedicated `parc_proxy` network. The overlay removes public DB/gateway/pooler ports and assigns unique container names. Its backend network is internal; functions/auth have a separate egress network. Apply bounded Docker log rotation to every service (daemon policy or per-service json-file limits) before launch.
4. Render the merged config privately using Compose >=2.24.4: `umask 077; docker compose -p parc -f docker-compose.yml -f compose.parc.yml config --format json > rendered.private.json`. This file contains secrets: never print, commit or publish it. Run `python3 preflight.py --config rendered.private.json --data-path /srv`. Delete the private temporary config securely after inspection. The check never prints credentials.
5. Check the expanded config for upstream changes; validate the overlay with the installed Compose version before starting anything. Use `docker compose ... up -d --wait` only after capacity/configuration gates pass. Perform the database plus file restore rehearsal described in the audit runbook. The official upstream plus overlay passed offline Compose 5.5.1 validation locally: 12 services, no published host ports, isolated backend/proxy networks. Both Caddy configurations passed Caddy 2.11.4 validation using its official SHA512-verified binary. This does not replace a start/restore test on the Linux target with real configuration.
6. Join the existing Caddy container to `parc_proxy` through its persistent Compose configuration, validate/import `Caddyfile.routes`, and reload only after staging acceptance. The API virtual host exposes the inventory function and signed object downloads; Studio/Auth/REST administration remain private. Test the allowlist against actual download routes.

## Backups and recovery

`backup.sh` requires an acknowledged write freeze and an independently initialized encrypted off-host restic repository. It captures database, roles, invoice bytes, functions and deployment configuration; `restic check` verifies repository consistency. It does not prove a successful application restore. Run a complete isolated restore, including file hashes and application tests, before cutover. Encrypt backups, restrict access, define retention with the data owner and monitor backup age/failures. Never schedule a blocking write freeze without the agreed operational window.

For ongoing backups, select either a short coordinated write freeze or a tested database-aware continuous-backup/object-versioning design. Do not silently claim an arbitrary live DB/files snapshot is transactionally consistent.

Set repository variable `INVENTORY_JOBS_PAUSED=true` during migration; change the single `IT_INVENTORY_API_URL` for scheduled jobs before resuming. Set `PRODUCTION_BACKEND=vps` to suppress the legacy hosted backend deployment and `PRODUCTION_FRONTEND=vps` to suppress Pages app deployments after its collector transition obligations have been addressed. Existing collector manifest URLs must remain reachable until upgrades are complete.

GitHub deploys now require quality checks and a `production-supabase` environment; configure branch protection and environment reviewers in GitHub. Those remote policies are not created merely by adding workflow YAML.

## Monitoring and privacy

Check HTTPS frontend health and a read-only API route, container readiness, disk/RAM, job processed/failed counts and invoice download failures. Alert on failures and stale backups. Do not log bearer tokens, prefill URLs, invoice paths or staff records. Keep log retention bounded. Define data retention and who can access all-fleet employee/invoice data; the existing roles are global, not team-scoped.

No public DNS record, certificate account, off-host backup destination or server resize is provisioned by these files. Follow the full [cutover/rollback runbook](../../docs/audit-2026-09-15/deployment-plan.md), including reconciliation of any target writes before rollback.
