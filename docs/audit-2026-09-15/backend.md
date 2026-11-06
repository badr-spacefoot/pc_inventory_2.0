# Backend, security and data audit — 2026-09-15

Scope: read-only source review of Supabase schema/migrations, Deno API handlers, roles, collection workflows, enrichment and invoices. AAS `security-auditor` and `supabase` full skill content was read. No production writes, attacks, SQL migrations or infrastructure changes were performed. Findings below are source-confirmed, with staging reproduction procedures, not claims that production was exploited. References use repository-relative paths and line numbers from the reviewed snapshot; subsequent fixes may move them.

### Live read-only verification (same audit)

Two aggregate/catalog SQL queries were subsequently run against the configured Supabase project, without selecting personnel, tokens, document paths or document content:

- 24 public tables all have RLS enabled; there are no public-schema RLS policies. The inventory view has `security_invoker=true` and denies SELECT to anon/authenticated.
- Both public functions (`set_updated_at`, `consume_collection_access_token`) deny anon/authenticated EXECUTE and allow service_role EXECUTE.
- The invoice bucket is private with a 10,485,760-byte limit and the expected six MIME types. There are no Storage policies granting public access.
- 108 devices, 17 invoice rows, 15 invoice objects; database 34,458,771 bytes; invoice objects total 1,457,206 bytes. This is a small current dataset, so B07 is a scale/completeness risk, not evidence of current missing devices.
- Zero orphan invoice objects, zero invoice paths lacking an object, zero devices with duplicate open assignment periods at query time. B10 remains a lifecycle defect, not a claim of present orphans.
- **B13 — Low, confirmed deployed grant drift:** `enrichment_jobs` alone retains anon/authenticated SELECT/INSERT/UPDATE/DELETE/TRUNCATE grants. RLS with no policies blocks normal row access today. RLS does **not** govern TRUNCATE, but no arbitrary SQL/TRUNCATE entry point was established and normal Data API row routes do not expose TRUNCATE; no public data leak or exploitable truncate route was established. `supabase/migrations/20260703171000_enrichment_jobs.sql:25` enables RLS but omits REVOKE, while the older global hardening migration cannot cover subsequently created tables. Revoke unnecessary grants in a migration and add schema-access assertions. Do not test TRUNCATE against production.

Secrets, upstream request/rate limits, live handler-version equivalence, backups and restore remain unverified in this sub-audit. Parent separately checked live migration inventory and Edge Function metadata. Companion `backend-live-evidence.json` records the aggregate/catalog results without personal data.

## Decision

Do not treat a DNS change to parc.piqa.fr as security remediation. The frontend can use that domain while retaining managed Supabase, but the API trust boundary needs correction and staging verification before calling this production-ready. In particular, stored XSS, non-revocable admin sessions, login abuse protection and privileged arbitrary URL fetches need attention. A VPS migration additionally exposes internal services to the SSRF path and needs a separate deployment decision.

## Findings

### B01 — High: disabled, deleted, demoted and password-reset users retain their old privileges for up to 12 hours

Evidence: `supabase/functions/inventory-api/index.ts:333` creates a token containing the user and 12-hour expiry. `:340-369` validates HMAC/expiry and returns its embedded role without querying `admin_users`. Updates at `:2937-2948` and deletion at `:3006` do not invalidate sessions. `ALLOW_LEGACY_ADMIN_LOGIN=false` also does not invalidate an already signed legacy session in this verifier.

Reproduce in staging: sign in as ADMIN A; use ADMIN B to demote/disable/delete A or reset A's password; reuse A's original token on a privileged route. Its original ADMIN role still passes `requireAction`. Impact: offboarding and incident-response controls do not terminate access.

Remediation: server-side sessions or a user/session version checked on each authenticated request; validate active account/current role and revoke on password/role/activation changes. Explicit logout should revoke, not merely clear browser storage. Add integration tests for all four operations and legacy-token expiry/revocation.

### B02 — High: collector-controlled text reaches an administrative stored-XSS sink

Backend evidence: `/collect/profile` consumes a collection credential and returns a 7-day script token (`index.ts:953-1002`). `/collect/scan` checks only hash and expiry (`:2551-2578`). `persistScan` accepts OS name/version using `safeString` at `:2348-2349`, which only trims and truncates (`core/input.ts:3-5`); scan history stores those values at `index.ts:2440-2441`. The frontend auditor identified their raw interpolation in `frontend/app.js:3432-3435`.

Reproduce only with synthetic staging data: submit markup in OS name/version with an authorized test collector token, then inspect that machine's scan history. HTML must render as text, never execute. This crosses from low-privilege collection input into an administrator's browser. Fix the frontend HTML sink (textContent or escaping at output), add a regression test, and consider CSP as defense in depth. Backend truncation alone cannot prevent this.

### B03 — High: no application login rate limit or failed-login protection

Evidence: `index.ts:815-916` directly performs password verification; router `:6719-6731` has no throttle. Repository searches for rate-limit/lockout/throttle controls found none in the backend. A disabled-account response precedes password verification (`:831`), additionally distinguishing disabled usernames. Password hashing exists (random salt, PBKDF2 SHA-256), but does not control online attempts.

The deployed gateway may impose generic limits; its settings were not available, so absence of all perimeter protection is not claimed. Configure persistent account+source attempt limits and backoff, uniform failures, and security-event monitoring; verify 429 and recovery on staging. Custom auth does not automatically inherit Supabase Auth login protections. MFA/SSO is absent from the reviewed custom flow and should be considered for administrators.

### B04 — High before self-hosting; medium/high currently: MANAGER can cause arbitrary server-side HTTP requests

Evidence: benchmark synchronization accepts `body.urls`, filtered only by `^https?://` (`index.ts:5115-5118`), then executes `fetch(url)` and unrestricted `response.text()` (`:4975-4993`). Authorization is `DEVICE_EDIT` (`:5031-5036`), which MANAGER has (`core/permissions.ts`). There is no hostname/IP allowlist, redirect validation, byte cap or timeout in this fetch.

Reproduce with an isolated staging HTTP fixture returning benchmark CSV; a manager-provided URL is fetched by the server. Do not probe real internal endpoints. On a VPS the same path could access loopback/private/container services; external large/slow responses can consume resources. Restrict sources to administrator-configured HTTPS origins, reject private/reserved resolved addresses, validate each redirect before fetching, stream-cap response bytes and set deadlines. Separate source configuration permission from ordinary device edit.

The CPU-release HTTP client is better scoped but incomplete: `domain/cpu-release/http-client.ts:54-95` restricts initial hosts and checks the final host *after* following redirects; `:99` slices text after downloading it. Validate redirects before following and enforce byte limits during streaming.

### B05 — Medium/high integrity: collection access authorizes arbitrary profile and machine reassignment

Evidence: collection payload email is syntax/domain checked but not bound to a verified identity (`index.ts:949-963`). `upsertUserProfile` updates an existing user by caller-supplied email (`:735-758`). Device identity is caller-supplied serial (`:1236-1242`); an existing matching device is upserted (`:2375-2379`) and assigned to the submitting user (`:2333-2345`). A stock device is reactivated (`:2330-2331`, `:2371`). A collection-invite payload is a prefill, not an enforced identity claim in `/collect/profile`.

Reproduce with two test profiles and a known synthetic serial: submit a collection under another user's email or scan the existing serial as the second user. Existing profile/assignment changes without DEVICE_EDIT. Automatic collection assignment may be intended, but it is not authenticated machine ownership. Bind personalized invites to server-validated identities; make conflicting identity/assignment changes pending approval or use per-device enrolled credentials. Document any deliberate shared-token trust policy.

### B06 — Medium: collection invite maximum-use and revocation checks race

Evidence: `consumeCollectionInvite` separately reads use count and revoked status, then writes `useCount + 1` by id only (`index.ts:708-732`). Two concurrent requests can both consume a one-use invite; revocation between read and update is not rechecked. The ordinary access-token RPC is already atomic (`schema.sql:577-599`), showing an appropriate local pattern.

Use an atomic SQL update with expiry/revocation/use conditions and `RETURNING`, through a restricted RPC. Test parallel submissions against a one-use invite and a concurrent revocation; exactly one valid consumption should succeed.

### B07 — Medium: fleet list silently depends on the database API row cap

Evidence: `/admin/devices` issues one unpaginated `select('*')` ordered by last-seen and returns it as the complete list (`index.ts:3412-3420`). The repository config does not specify the deployed Data API maximum rows. When the fleet exceeds that cap, older machines are absent from frontend totals and exports. Other routes contain fixed 1000/2500 caps without complete-dataset guarantees.

Reproduce in staging with row count above its configured cap; compare database count with returned device IDs. Use deterministic paginated retrieval/server-side aggregates with explicit completeness metadata; test >cap inventory. Live SQL counted 108 devices; the configured Data API cap remains unknown. Current truncation was not established.

### B08 — Medium: enrichment job completion does not guarantee each device was visited

Evidence: every batch selects the oldest `last_enriched_at` rows without a job worklist/cursor (`index.ts:5933-5937`). Cached results return early without updating that date (`:1947-1951`) but still count as processed (`:5753`, `:5944-5945`). Once the oldest rows are cached, the next batch can select the same rows repeatedly while counters reach total_count. Concurrent calls also read identical processed_count then overwrite counters with no lease/version predicate (`:5900-5914`, `:5976-5981`).

Reproduce: seed more than one batch of fresh cached rows and invoke successive batches; record distinct device IDs. Separately invoke two batches concurrently. Fix with per-job device membership and atomic claims/leases or a stable cursor plus idempotent results. Assert unique completed/skipped device counts, correct resumption and concurrent safety.

### B09 — Medium: deleting the final purchase invoice leaves an invoice-backed valuation

Evidence: delete invokes `syncLatestInvoiceValuation` (`index.ts:6585`), but that function exits if no positive-price purchase invoice remains (`:6134-6136`). It therefore leaves earlier `book_value`, `valuation_method=invoice_backed`, confidence A/100 and source invoice set at `:6184-6207`.

Reproduce: add a priced purchase invoice, verify invoice-backed metadata, delete the only invoice, re-read enrichment. Clear/recompute invoice-derived fields and provenance when the authoritative invoice disappears; test removal of last invoice and fallback to an older one. Do not simply erase independent market estimates.

### B10 — Medium: invoice Storage objects become orphaned and mutation failures are not atomic

Evidence: device deletion (`index.ts:4318-4366`) deletes only the DB device; invoice rows cascade (`schema.sql:490`), but Storage objects are never collected. Individual invoice deletion ignores Storage remove errors (`index.ts:6579-6582`). Upload succeeds before the DB invoice insert (`:6341`, `:6513`), and a later failure has no compensation. Invoice, valuation and history changes span separate requests.

Potential result: inaccessible-but-retained documents, storage growth, partial updates, and retries that can create duplicates. Use an outbox/retryable Storage cleanup keyed to recorded paths, compensating cleanup for failed inserts, and transactional database mutations/idempotency keys. Staging tests should simulate failed insert/delete/history/storage operations. Live aggregate SQL found zero orphan invoice objects and zero referenced invoice paths missing their object; no paths or document contents were returned.

### B11 — Medium: unbounded request decoding; declared MIME is the only upload type check

Evidence: JSON bodies are parsed without local size guards (e.g. `index.ts:816`, `:2577`, `:6367`). Invoice base64 is decoded before the 10MB check (`:6321-6326`), producing additional memory copies. MIME is caller-supplied and checked against a set (`:6330-6335`) without checking bytes. Private bucket and 10MB storage constraints exist, which reduce exposure but do not bound parsing memory.

Require upstream and streaming application request limits; reject oversized encoded content before decoding. Verify actual file signatures, use safe download headers and optionally document malware scanning if invoices circulate broadly. Do not claim MIME checking alone certifies file safety.

### B12 — Medium reliability: audit failures are silently ignored

Evidence: `audit` and `notify` await Supabase insert responses but never inspect `.error` (`index.ts:428-458`). Supabase failures can therefore lose traceability while the primary action succeeds. Profile token insert (`:989-993`) similarly ignores errors and can return an unusable token. Make errors explicit and define an outbox/retry policy for non-critical notifications; keep security audit writes durable and correlated with mutations. Test injected database errors.

## Additional observations and coverage

| Area | Reviewed result / remaining work |
|---|---|
| SQL access | Live catalogs confirm RLS on all 24 public tables, no public policies, security_invoker inventory view with no anon/auth SELECT, and both functions restricted to service_role rather than anon/auth. Live enrichment_jobs grants differ from consolidated schema, as B13 records. Service role intentionally bypasses RLS, so API checks remain critical. Parent separately confirmed the live migration inventory. |
| RBAC | ADMIN/MANAGER/VIEWER/READ_ONLY matrix exists; invoice deletion checks both invoice and device id (`index.ts:6564-6575`). Roles are global: no tenant/team ownership boundaries. Confirm that all viewers may see all staff, financial invoices and historical scans; VIEWER and READ_ONLY are effectively the same matrix. |
| Secret handling | Service key sourced from server env (`index.ts:77-78,145-147`); admin hashes omitted from public user projection. No actual secret values were read or copied. Environment strength/rotation is unknown. |
| Token storage | Access/account invite tokens hashed; prefills intentionally store and return plaintext collection credentials (`:1083,1120`), reusable until expiry. Restrict access, minimize TTL, redact URLs/logs, and set no-store on credential/PII responses. Script token used_at is recorded but not enforced as single use (`:2561-2567`); decide whether repeated scans are intended. |
| Public organization | Unauthenticated `/organization` returns active team descriptions and establishment city/country (`:3560-3585,6748-6752`). This is a deliberate public surface for collection but should be minimized/credential-gated if organizational information is internal. |
| Errors | Generic outer 500 avoids direct raw error leakage (`:7005-7007`); operational errors are logged and enrichment error text may persist in notes (`:5768-5779`). Set redaction and retention, especially URLs containing tokens. |
| Privacy | Staff identity, hardware identifiers, scan payload JSON, assignment history and invoices are stored. Retention/deletion/export policy and backup residency were not established. This is not a legal-compliance certification. |
| Integrity | Unique dedupe and lookup keys/indexes exist; scan updates, assignment periods/history and collection token issuance are multi-call operations without transactions. Staging failure/concurrency tests are needed. |
| Performance | Useful device/history/invoice/CPU indexes exist. Live database size is 34,458,771 bytes with 108 devices. No EXPLAIN or load measurement was performed. Large aggregate view + select('*') and per-invoice signed URLs warrant real-data performance checks. |
| Tests | Five backend test files cover domain/core logic. No local end-to-end handler/DB/RLS/auth revocation/concurrency suite was identified. Parent handles execution; this report does not claim these scenarios were run. |
| Host migration | Default CORS is GitHub Pages plus localhost (`index.ts:97-104`); parc.piqa.fr must be configured in ALLOWED_ORIGINS. Custom auth relies on verify_jwt=false (`supabase/config.toml`) plus its own handler authorization; do not blindly enable gateway JWT checking. Hosting frontend alone does not require moving the database. |

Official reference consulted: [Supabase RLS and service-role behavior](https://supabase.com/docs/guides/database/postgres/row-level-security). Source and live catalog checks establish the recorded privileges and policies; staging runtime role tests remain necessary to verify complete endpoint behavior. A request for the official select reference timed out, so no unverified numeric production row cap is asserted.

## Release verification required

1. Stored-XSS regression, role denial matrix, session revocation and login throttling in isolated staging.
2. Atomic invite consumption and distinct-device enrichment progression/concurrency tests.
3. Invoice add/delete/recompute/storage-cleanup failure tests; complete inventory above configured row cap.
4. Live table/function catalogs and private bucket have been checked, and parent checked migration inventory. Complete verification of source URL configuration, auth flags and host CORS; repeat catalog checks after remediation.
5. Backup plus restore exercise covering both PostgreSQL and Storage, monitoring/redaction, and explicit collection identity policy before broad rollout.
