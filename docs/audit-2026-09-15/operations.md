# Operations and deployment evidence

Snapshot: 15 September 2026. Read-only inspection; no deployment, cleanup, purchase or configuration mutation.

## OPS-01 — Capacity blocks full-stack coexistence today

The VPS identified through the existing OVH task is `ubuntu@217.182.169.255`, hostname `vps-605d188d`, Ubuntu 26.04.1, four CPUs. At inspection:

| Resource | Observed |
|---|---|
| RAM | 7,746 MiB total; 4,383 MiB used; 3,362 MiB available |
| Swap | 2,047 MiB total; about 1,000 MiB used |
| Root disk | 72 GB total; 66 GB used; 6.4 GB available; 92% used |
| Containers | 16 running; existing application health checks healthy at snapshot |
| Larger memory consumers | Pulse about 1.515 GiB; Pimboost 939 MiB; Keycloak 528 MiB; n8n 332 MiB |
| /srv | About 28 GB; catalog-pulse about 25 GB; pimboost-app about 2.4 GB |

Supabase documents a minimum of 4 GB RAM / 2 cores / 40 GB SSD for its Docker stack and recommends 8 GB+ / 4 cores / 80 GB+; these are stack requirements, not headroom guarantees for this shared host. The available RAM is already below the documented minimum and the disk cannot safely accommodate images, data, logs, backup and restore space. [Official self-hosting requirements](https://supabase.com/docs/guides/self-hosting/docker).

Engineering proposal: increase this shared VPS to at least 16 GB RAM and around 160 GB disk, then measure representative coexistence load. This is a starting capacity target, not a quoted OVH plan or guaranteed sizing. More CPU may be needed if the existing applications saturate it; CPU peak history was not collected. An owner-approved cleanup may help disk but does not resolve RAM by itself. The largest directories are not presumed disposable. Nothing was deleted, pruned, resized or purchased.

## OPS-02 — Dependency and build drift

`dependency-audit.json` records 12 pnpm advisory entries: nine high and three moderate, across development dependencies only. Relevant patched versions reported by the audit include brace-expansion 1.1.18/5.0.9, postcss 8.5.23, js-yaml 4.3.2, nanoid 3.3.18 and vitest/@vitest/mocker 4.1.11. Resolve the lockfile to supported patched versions and run the quality checks; do not blindly force incompatible overrides. Some entries describe different advisories affecting the same dependency, and the Vitest/mocker entry overlaps.

For example, the Vitest advisory concerns a dev-server mocker interface; this audit used `vitest run` and established no exposed production mocker server. [Primary advisory](https://github.com/advisories/GHSA-82fw-gwwq-j7x9). The app has no npm production dependencies, but its Deno remote imports and native collector packages are outside pnpm audit coverage.

Local quality was verified with Node 24.19, Python 3.14 and pnpm 11.19; CI specifies Node 22, Python 3.12 and pnpm 10. Normalize/document the supported toolchain and line endings. Avoid mass-reformatting unrelated files into the stock fix.

## OPS-03 — Release and deployment gates are inconsistent

Read-only GitHub checks found main unprotected, at `6255c83ca826e8db72262e3eb17149031c7e7040`. Latest quality and Pages workflows succeeded on 24 July at that revision. The latest collector release is `collector-v0.1.52`, published 24 July, with three native artifacts, SHA256SUMS and an internal-test certificate. Presence of that certificate does not independently establish each binary's signature.

Pages deployment runs quality first. `.github/workflows/supabase-deploy.yml` pushes database migrations and then deploys the function without an equivalent quality dependency, staging/restore gate or explicit serialized rollback procedure. Collector publication is likewise not dependent on the main quality suite and allows non-production signing. Require protected changes and a single reviewed release revision, quality gates, native smoke tests and serialized deployment. A failed function deploy after successful database migration must have a compatible recovery path.

Today's valuation, authoritative CPU and CPU benchmark workflows succeeded at 10:23:07Z, 09:35:09Z and 08:45:51Z respectively. Their scheduler times and actual starts differ. Monitor completion, record counts and freshness, not just workflow green status. B08 explains why a successful job can still revisit cached records.

## OPS-04 — Domain and runtime configuration are not migration-ready

DNS nameservers are `dns106.ovh.net` / `ns106.ovh.net`; `parc.piqa.fr` returned NXDOMAIN. Existing Caddy has no parc host block. `piqa-caddy` uses image `caddy:2.11.4-alpine`, public ports 80/443, config `/srv/vaultwarden/Caddyfile` and persistent Caddy data/config volumes. It currently joins the Atlas private and Vaultwarden proxy networks; do not place the new database on those networks merely for convenience.

The frontend core reads runtime URL overrides, but `frontend/index.html` does not load a `config.js` before the core/app scripts. The `.env.example` instruction alone does not implement runtime configuration. Supply and load a public configuration artifact explicitly; it may contain public API/download URLs, never service-role or signing secrets.

Current defaults point to the hosted Supabase function and GitHub Pages collector resources. Deployment CORS settings name the old origin and localhost, not parc. Scheduled workflow URL variables, prefill/deep links, updater manifests, signed file URLs and installed collectors all require migration tests. The cloud deployment workflow must be deliberately replaced or disabled for production when the authoritative backend moves.

## OPS-05 — Web headers and asset caching need a hosting policy

Read-only HTTP checks of the existing homepage and app asset returned 200, HSTS and a 600-second cache lifetime. CSP, X-Content-Type-Options, Referrer-Policy and X-Frame-Options were absent from those responses. Add an application-appropriate CSP including frame-ancestors, nosniff and a referrer policy through the new proxy; test API calls, downloads, weather, images/SVG and styles before enforcement. CSP supplements, rather than replaces, fixing FE-01.

Script query suffixes are static rather than content hashes. Use versioned assets and short/no-cache HTML/runtime config so a cutover does not leave clients mixing API contracts or endpoints. Never cache private API responses through the reverse proxy.

## OPS-06 — Recovery and observability are unproven

No repository VPS deployment manifest or demonstrated restore procedure was found. The source database is about 34.5 MB and stored invoices about 1.46 MB, so data volume is manageable. Database-only backup is insufficient: file bytes, functions, secrets, job configuration and proxy configuration also matter. Existing backup coverage cannot be inferred from one directory size. Off-host backup destination, retention, recovery objectives and successful restoration remain unverified.

Create isolated service health checks, disk/RAM alerts, bounded logs, backup-age/failure alerts and a tested restore path. Record database/API errors, enrichment progress and collector submission failures without logging tokens or employee data. Keep studio/admin infrastructure private. See the migration runbook for acceptance and rollback.

## Performance and validation evidence

Current raw/gzip sizes: index 66,513/11,599 bytes; app.js 253,843/58,607; generated core.js 129,418/33,933; CSS 73,993/12,576. Main JS is approximately 383 KB raw / 93 KB gzipped. This is not a measured performance failure. Filtering rerenders broad views, device listing lacks pagination and some work scales with the entire fleet; measure with realistic future fleet sizes.

Live performance advisor reported 16 missing foreign-key indexes and 19 unused-index notices. Evaluate query plans and write costs before adding/dropping indexes. The security advisor call failed internally; manual live catalog/grant/RLS checks were completed instead, so no clean security-advisor result is claimed.

The full quality command passed in the ignored `reports/audit-lf-check` copy of 172 tracked current files, normalized to LF. Results: formatting/lint/type checks/build pass; frontend 22 test files, 185 passed and 3 skipped; collector 16 passed. The original checkout's CRLF formatting failures are recorded separately from semantic test results. Synthetic Chromium results and script are retained in this directory; external requests were blocked and the loopback fixture server was closed.
