# Corrections delivered — 15 September 2026

**Current follow-up:** see [6 November consolidation and release preparation](../operations/2026-11-06-release/README.md). The unpublished security migration now uses the generated filename `20261106171331_audit_security_data_integrity.sql`, after the already-applied repair migration; its SQL bytes are unchanged. The statements below remain the September historical record.

The application, backend, collector and deployment corrections are implemented locally and tested. Production has not been changed. This document supersedes the original audit's implementation-status statements; the original findings remain a historical record.

## What changed

| Area | Delivered |
|---|---|
| Web security/correctness | Escaped scan/price text, stale device-response protection, spreadsheet-safe CSV, private-state cleanup and stale-session response rejection |
| Valuation | Stock fix retained; genuine zero values preserved; full disks flagged; depreciation uses matched value coverage rather than different populations |
| Accessibility/usability | Keyboard device buttons and notifications, named dialogs, language changes preserve drafts; native collector buttons restore focus/keyboard behavior |
| Administrator access | Database-backed revocable sessions, immediate revocation on account changes, logout endpoint, persistent account/global login limits and generic credential failures |
| Collection identity | Existing profiles cannot be overwritten by a claimed email; existing machines require an authorized device-bound invitation; invite use and account-invite acceptance are atomic |
| Backend inputs/integrations | HTTPS provider allowlists, redirects rejected before following, streamed size/time limits, bounded request/base64 ingestion, file signature checks, no-store responses |
| Data/reliability | Complete paginated fleet retrieval; persistent job membership, leases and fenced results; transactional invoice provenance invalidation and history; stable invoice retry keys; versioned retryable file-cleanup queue; transactional metadata audit and restricted SQL grants |
| Collector trust/privacy | Ed25519-verified metadata and artifact hashes before updates, Windows publisher checks, macOS notarization gates, no quarantine stripping, HTTPS redirects, protected/minimized drafts, endpoint-bound credentials/submissions, fixed delayed exception callbacks |
| Build/release | Pinned/hash-locked collector dependencies and osquery; quality-gated releases/API deploys; production signing fails closed without credentials; installed Linux smoke checks added; patched npm dependencies |
| Hosting preparation | Explicit public config loaded before app, allowlisted static packaging and hashed asset URLs, Caddy headers/CSP/routes, isolated Compose overlay, capacity/network/secret preflight, bounded container logs, write-freeze/off-host backup script and rollback runbook |

Detailed mappings and limitations: [frontend](frontend-remediation.md), [backend](backend-remediation.md), [collector](collector-remediation.md), [deployment review](deployment-review.md). New backend migration: `supabase/migrations/20260915132127_audit_security_data_integrity.sql`; deployment kit: `deploy/vps/`.

## Verification

- Final full `quality` command passed in the actual workspace with the pinned pnpm 10.34.5 toolchain: formatting, ESLint, TypeScript, Deno formatting/check, JavaScript/Python syntax, frontend build, **227 TypeScript tests passed / 3 intentionally gated live-network tests skipped**, and **29 collector tests passed**. Tests are restricted to the real `tests/` tree, excluding copied audit workspaces.
- Embedded PostgreSQL tests execute the migration and verify session revocation, invite consumption/acceptance, job claims/fencing/counters, invoice history/idempotency/provenance, cleanup queue versioning, restricted grants and transactional audit rollback. This is not a full Supabase/Storage HTTP or simultaneous multi-connection load test.
- Synthetic Chromium tests prove HTML remains text, selected device/detail remain consistent, stock valuation works, keyboard actions/dialog names/logout cleanup work, and language changes preserve drafts. No real employee data or production requests were used.
- A packaged site loaded under the actual proposed CSP with no page errors or CSP violations; runtime configuration and a mocked map worked. This does not prove real TLS, external provider availability or signed invoice downloads after migration.
- Caddy 2.11.4 validated both configuration files using the official SHA512-verified Windows binary. Compose 5.5.1 validated the pinned official upstream plus overlay offline: 12 services, no published host ports, private backend and dedicated proxy/egress networks. Backup shell syntax passed. No containers were started.
- Final npm dependency audit reports zero advisories. [Result](dependency-audit-after.json). This scope does not include all Python/Deno/system packages.
- Repository LF policy and line endings now allow the full formatting gate to pass directly on Windows. Many files therefore have mechanical line-ending changes; `git diff --ignore-space-at-eol` isolates substantive edits. CI retains Node 22/Python 3.12; the local run used Node 24/Python 3.14, so hosted CI/native-platform execution is still needed.

## Rollout behavior that must be understood

1. Apply the security migration before the new API, and release the matching frontend. Existing administrator sessions are invalidated; users sign in again. Named administrator accounts are required; the first-account bootstrap remains available with its configured bootstrap password.
2. Existing collectors cannot overwrite a known machine using only a shared collection token. An administrator issues a device-specific invitation to reauthorize a scan. New generic invitations still register new machines.
3. Signed updates are served through the GitHub release's stable signed-metadata URL. Before valid signing resources and metadata exist, automatic updating is unavailable while collection remains usable. Existing unsigned binaries cannot be repaired by editing source alone.
4. Set `SUPABASE_PUBLIC_URL=https://parc-api.piqa.fr` for the self-hosted function so signed invoice URLs use the public origin while backend service access remains internal.
5. Configure the scheduled cleanup endpoint with the existing enrichment secret, and use the job-pause/production-target variables during migration. Merely committing workflow YAML does not configure remote branch/environment protection or change deployed schedules.

## What still prevents production release/migration

- **Signing resources:** the user confirmed Windows signing and Apple Developer resources are not available. Production collector releases are deliberately blocked until they are provisioned, along with the release-metadata signing key. No certificate/account was purchased and no exception to Defender was added. The original Defender alert still needs its exact detection/artifact checked.
- **VPS capacity:** the shared server's measured 92% disk use / 6.4 GB free remains a blocker. The capacity guard rejects insufficient disk/RAM. No resize, cleanup or purchase was performed.
- **Staging and recovery:** provision an isolated compatible Supabase stack after capacity is available; exercise actual auth, collection, concurrent jobs, invoice HTTP/storage retries and data/file restore. Configure an encrypted off-host backup destination and retention, neither of which has been supplied. Validate provider canonical URLs and outbound network isolation, including private/metadata destination blocking; the application host allowlist is not DNS/IP pinning.
- **Native and operational acceptance:** execute the real Windows/macOS/Linux install/update matrix, Defender checks, GitHub protection settings, hosted CI and the coordinated cutover. No source commit, public release, DNS change, production migration or deployment was made in this correction turn.

The [full deployment runbook](deployment-plan.md) and [deployment kit](../../deploy/vps/README.md) describe the remaining sequence. The code corrections are ready for staging; production acceptance remains open until these external requirements pass.
