# Migration runbook — parc.piqa.fr on the existing OVH VPS

Status: prepared for review, not executed. Target is the same server as Atlas, Pulse and Pimboost, as requested. The application, database, API and invoice files will move together. Retain the current Supabase-compatible architecture to avoid introducing an unrelated database/authentication rewrite.

## 1. Target layout and prerequisites

| Component | Proposed destination |
|---|---|
| Website | `https://parc.piqa.fr`, static frontend served through existing Caddy |
| API / signed file URLs | `https://parc-api.piqa.fr`, separate Supabase gateway origin |
| Deployment directory | `/srv/spacefoot-parc`, dedicated Docker Compose project `parc` |
| Database | Private PostgreSQL 17, compatible with the source Supabase schema/extensions |
| API runtime | Self-hosted Supabase Edge Runtime with the inventory-api function |
| Invoice objects | Private Supabase Storage, dedicated persistent volume and off-host backup |
| Networks | Dedicated private backend network; separate parc proxy network shared only by Caddy and public frontend/gateway services |
| Administration | SSH/tunnel or existing approved private access; no public database, Studio or Docker API |

The secondary API hostname is a proposal, not an existing DNS record. Add OVH DNS only after the target is validated. Reuse the existing reverse proxy and its persistent certificate storage; do not start another process competing for ports 80/443. Restrict proxy routes to required application services.

First resolve OPS-01 capacity. Suggested initial shared-host target is 16 GB RAM / approximately 160 GB disk, followed by measurement. Confirm actual OVH resize implications, maintenance requirements and cost before purchasing. No plan, resize or cleanup was authorized by this runbook itself.

Pin a reviewed official Supabase self-hosted release and its images. Source PostgreSQL is 17.6.1.127; test extension and platform-schema compatibility. Do not blindly restore into a lower PostgreSQL major version. The current Docker stack has multiple services and evolving gateway configuration; use the selected release's supplied configuration rather than mixing files from different releases. [Official Docker setup](https://supabase.com/docs/guides/self-hosting/docker).

## 2. Application and collector changes before staging

1. Resolve P1 application findings: HTML sinks, stale selection responses, session revocation, custom login abuse controls and outbound fetch restrictions. Add focused regression/integration tests and retain the stock valuation fix.
2. Add an explicit public frontend configuration file loaded before `core.js` and `app.js`. Set the new API and collector-resource URLs. Keep secrets server-side. Test a clean browser and an already-cached browser.
3. Configure CORS for the exact production origin, with transitional origins only where needed. Keep custom application authorization intact: this function currently uses custom bearer tokens and `verify_jwt=false`; enabling an incompatible Supabase gateway JWT check would break it. Public collection routes still require their application credentials and validation.
4. Separate internal service URLs/credentials from external URL generation. Verify Storage signed download URLs use a browser-reachable HTTPS origin and retain correct signatures after proxying. Keep the invoice bucket private.
5. Reconfigure scheduled CPU/catalog/valuation jobs and deployment variables for the new endpoint. Provide health/freshness/error reporting. Ensure only one production scheduler writes at a time.
6. Fix updater authenticity, trusted HTTPS endpoint handling and Windows update relaunch configuration. Issue signed native builds and test clean installation, existing installations, stale drafts, prefill links, scan submission and updates on the supported Windows/macOS/Linux versions.
7. Add headers and consistent asset versioning. Gate API, frontend and collector releases on the reviewed revision's checks. Publish no production credentials in GitHub Pages or frontend artifacts.

An installed collector has compiled defaults and may continue calling the old Supabase URL. A website domain change cannot fix that. Keep the existing release manifest reachable while clients update. For legacy API callers, implement and test a controlled transition that forwards to the new authoritative backend or clearly requires an update; do not leave two writable inventories. Verify credentials, prefill references and signed tokens across the chosen transition. Do not delete the old service until remaining use has been measured and resolved.

## 3. Provision isolated staging

- Capture existing Caddy configuration, running service health and resource baseline without exposing credentials. Back up configuration before any authorized change.
- Create dedicated parc volumes, networks and secrets with restrictive permissions. Keep database/service-role credentials and signing keys out of repository files, shell output and frontend configuration.
- Bind staging endpoints privately or use a protected staging hostname. Block unintended outgoing requests and production schedulers. Do not send production employee notifications during a rehearsal.
- Set storage/log limits, resource monitoring, database/API readiness probes and external HTTPS checks. Confirm Atlas, Pulse, Pimboost and other existing services remain healthy throughout.
- Define an encrypted off-host backup destination, access owner, retention and recovery objectives. These details are not yet established. A backup on the same VPS alone is not sufficient recovery coverage.

## 4. Rehearse the complete data move

Use the official platform-to-self-hosted procedure and a compatible Supabase CLI export of roles, schema and data. Managed internal schemas need special handling; avoid indiscriminately restoring every managed role/schema into a fresh self-hosted stack. Keep the source migration ledger and reconcile the existing baseline schema; do not replay already-restored migrations. [Official restore procedure](https://supabase.com/docs/guides/self-hosting/restore-from-platform).

The source project has 25 migrations matching the local inventory, 24 public tables with RLS, two restricted public functions and a security-invoker inventory view. Preserve and validate those controls after restoration. Copy private Storage object bytes as a separate task; a database dump does not copy the files. Restore the function code and securely configure required secrets and job settings. [Storage copy guidance](https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3), [self-hosted functions](https://supabase.com/docs/guides/self-hosting/self-hosted-functions).

Audit baseline is 108 devices, 17 invoice rows and 15 stored invoice objects. These numbers can change before migration: record fresh counts and per-object byte hashes during the actual freeze. Compare source/target records, relationships, timestamps, histories, enrichment/provenance, private bucket configuration, object lengths/hashes and signed-link access. Some invoice rows may use external links, so row count need not equal object count.

Test a new administrator login and existing password hashes. Prefer fresh session-signing material and explicit reauthentication after cutover; preserve other credential hashes/keys only where required by the tested collector transition. Reissue expiring tokens where needed and document their behavior. Never assume copying rows alone preserves every signed link or session.

Source database export access, off-host backup access and a successful restore have not been verified yet. Establish them before scheduling the cutover. The live read-only connector checks are not a recoverable export.

## 5. Acceptance gate

All of the following must pass in staging before production cutover:

| Area | Required verification |
|---|---|
| Authentication | Login/logout; roles enforced; disabled/deleted/demoted/reset users lose prior access; bounded login abuse protection |
| Inventory | Filters including stock; details remain tied to selected PC; assignment/stock/retire/reactivate history correct |
| Valuation | Known fixtures for launch/current/zero/unknown values, matched-coverage depreciation, stock ages and replacement exclusions |
| Collection | Fresh and upgraded collectors; valid/expired/replayed token behavior; trusted identity handling; no duplicate devices from retry |
| Invoices | Upload, private signed download, expiry, warranty linkage, delete compensation and correct valuation after last invoice removal |
| Integrations | CPU and market fetch restrictions; bounded response/timeouts; batch progress, retry and job lease behavior |
| Web UX | Keyboard navigation/dialogs, FR/EN, small/large screens, export safety, stale-request and logout handling |
| Data | Fresh source/target counts and hashes; no missing/orphan files; RLS/grants/functions match intended access |
| Security | HTML remains text; hostile URL fixtures rejected; no secrets in bundles/logs; public endpoints expose only intended services |
| Operations | HTTPS, correct CORS/signed URLs, backups restored successfully, alerts exercised, other VPS apps healthy under representative load |
| Delivery | One tested revision; pinned images and dependencies; native publisher signatures verified; rollback rehearsal recorded |

Agree a maintenance window and measurable abort thresholds based on the staging baseline. Do not invent response-time/SLO numbers without measurements and an operational requirement.

## 6. Controlled cutover

1. Record the approved release, source/target configuration, backup locations, validation results and responsible operator. Lower relevant DNS TTL in advance if appropriate; currently parc has no record.
2. Place the existing app and collection ingress in a controlled maintenance/read-only state. Pause old scheduled writers and drain in-flight jobs. Verify the source is no longer changing.
3. Take final consistent database and Storage backups. Restore/copy the final changes to the target and repeat counts, relationships, byte hashes and access checks.
4. Install the validated Caddy host configuration, validate it before reload, then add the intended DNS records. Verify certificate issuance and routing. Leave unrelated virtual hosts unchanged.
5. Enable the target as the sole writer and enable exactly one set of jobs. Activate the tested collector transition. Check login, a controlled end-to-end collection, invoice download and stock valuation.
6. Observe application failures, job progress, collector adoption and VPS/neighbor health through the agreed stabilization period. Retain the old environment read-only for the agreed recovery interval.

## 7. Rollback without losing new writes

Before target writes begin, rollback can restore routing to the unchanged source and restart its jobs after confirming no target writes occurred. After target writes begin, simply switching DNS back can lose changes or create divergent records.

For post-write failure: freeze target ingress/jobs, preserve target database and file deltas, identify writes since the cutover point, and use a rehearsed reverse migration/reconciliation before reopening the source. If that cannot be completed safely, keep maintenance mode while restoring service on the target from the validated recovery point and replaying retained changes. State the actual recovery point and any unrecoverable changes explicitly.

Keep both backups and source read-only until acceptance. Remove transitional credentials/routes and retire the old writable infrastructure only after collector migration and rollback retention are complete.
