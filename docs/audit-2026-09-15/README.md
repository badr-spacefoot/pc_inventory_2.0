# Spacefoot IT — full application audit, 15 September 2026

**Update after authorized corrections:** see [Corrections delivered and remaining rollout requirements](CORRECTIONS.md). The findings and implementation-status statements below describe the original audit snapshot.

**Decision: retain the application and deploy it at `parc.piqa.fr` on the existing Atlas / Pulse / Pimboost VPS after remediation and a rehearsed migration. It is not ready for that cutover today.** The principal blockers are administrative HTML injection, session revocation, login abuse protection, unsafe outbound URL fetching, collector release trust, and insufficient spare VPS capacity. A framework rewrite is unnecessary.

This is an evidence-based review of the web application, API, database, desktop collector, releases and hosting. Source review covers the major modules and workflows; live checks were read-only. Browser reproductions used synthetic data and blocked external requests. This is not a claim that every branch, operating system or production interaction was dynamically tested.

## Deliverables

- [Frontend, functional and accessibility findings](frontend.md), including browser reproduction evidence.
- [Backend, authorization, data and integration findings](backend.md).
- [Windows/macOS/Linux collector and release findings](collector.md).
- [Operations, dependencies, deployment and validation evidence](operations.md).
- [Full migration runbook for the existing VPS](deployment-plan.md).
- [AAS selection and coverage](skills.md), [catalog manifest](aas-manifest.json).
- Machine-readable evidence: [browser fixtures](frontend-fixture-results.json), [database aggregates](backend-live-evidence.json), [dependency audit](dependency-audit.json).

## Direct answers to the reported problems

**Stock valuation:** the previous filter logic excluded stock devices from the valuation/age population. The existing local fix includes stock in value and age while excluding it from active replacement recommendations. Browser verification with one synthetic stock PC showed EUR 1,000 launch value, EUR 300 current value, 70% depreciation, five years of age and zero replacement candidates. The five modified source/test files remain local and uncommitted; the fix is not deployed. Missing valuation inputs for an individual PC can still legitimately produce an unknown value.

**Microsoft Defender blocking the collector:** the exact alert, affected binary hash and actual binary signature have not been verified, so this audit cannot identify the specific detection or declare it a false positive. Release configuration allows self-signed Windows builds; the updater does not verify artifact authenticity before execution. Remedy the release process with a trusted publisher signature, timestamping, verified update metadata/artifacts and clean Windows install/update tests. For the actual affected artifact, record the Defender detection name and SHA-256, verify its provenance, and submit it to Microsoft if it is incorrectly detected. Do not resolve this by disabling protection. Signing improves provenance but does not guarantee immediate reputation or clearance: [Microsoft SmartScreen guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation), [Microsoft file submission](https://www.microsoft.com/en-us/wdsi/filesubmission).

**Hosting:** the existing OVH VPS has been identified and inspected. `parc.piqa.fr` does not currently resolve. OVH manages the domain's DNS and Caddy is already serving the other applications. The database is small; the full Supabase runtime and safe operational headroom are the capacity concern. A DNS change alone does not move the API, files, scheduled jobs or installed collectors.

## Prioritized action register

Severity reflects impact and prerequisites, not evidence of an actual compromise. The frontend and backend HTML-injection findings describe the same underlying issue and must not be counted twice.

| Priority | Finding / reference | Required result before acceptance |
|---|---|---|
| P1 — before cutover | Stored HTML injection, FE-01 / B02 | Render collector OS and market source fields as text. Audit adjacent HTML sinks. Browser tests prove tags remain text. Harmless HTML interpretation was reproduced; no executable payload was used. |
| P1 — before cutover | Non-revocable privileged sessions, B01 | Disable, delete, demote or reset an account and its previous session immediately loses access. Verify current account state/role server-side. |
| P1 — before cutover | Custom login lacks throttling, B03 | Add bounded abuse protection and consistent responses; validate rate limits without attacking production. Supabase Auth defaults do not protect this custom login. |
| P1 — before VPS exposure | Outbound fetch/SSRF, B04 | Reject private, loopback and metadata destinations, validate redirects/resolved addresses, constrain providers and enforce time/response-size limits. Test against controlled staging endpoints. |
| P1 — operational blocker | Shared VPS capacity, OPS-01 | Add headroom and verify current services remain healthy under migration and representative application load. |
| P1 — before broad collector release | Update authenticity and signing, COL-01/02/03 | Verify signed metadata and artifacts before execution; enforce trusted Windows publisher signing and macOS signing/notarization; remove automatic quarantine stripping. |
| P1 — functional correctness | Device selection race, FE-02 | Latest selection owns both detail and actions; stale successes and failures cannot overwrite it. Synthetic browser test reproduced selected B / detail A. |
| P2 — integrity | Collection identity and invite races, B05/06 | Define trusted identity/reassignment rules, prevent unintended stock reactivation, and atomically consume invites. |
| P2 — valuation/data lifecycle | FE-05/08; B07–10 | Handle true zero free space, calculate depreciation on comparable coverage, paginate reads, advance/lease enrichment jobs, invalidate removed invoice provenance, and compensate Storage failures. |
| P2 — frontend privacy/accessibility | FE-03/04/06/07/09 | Neutralize CSV formulas, provide keyboard device navigation, fix notification key propagation, clear private state on logout, and label dialogs. |
| P2 — collector reliability/privacy | COL-04–10 | Fix deferred exception callback capture, retain VPS endpoints across updates, require trusted HTTPS, expire protected local drafts, pin builds, and test supported native platforms and keyboard use. |
| P2 — backend reliability | B11–13 | Bound request decoding, validate file content, check audit/notification errors, and remove unnecessary database grants. |
| P2 — delivery/operations | OPS-02–06 | Patch development dependencies; gate every deploy/release; configure the new URLs; add headers, health checks, backup/restore and rollback verification. |

Each specialist report provides source locations, impact, remediation and validation procedures. Source line numbers refer to this audit snapshot and may move after fixes.

## Coverage of application elements

| Element | Reviewed and observed | Remaining acceptance work |
|---|---|---|
| Login, administrators, roles | Custom PBKDF2/HMAC flow, route permissions, account lifecycle | Revocation and abuse protection integration tests |
| Fleet, stock, filters, detail | Domain predicates, render paths, selection, browser fixtures | Fix race; production stock inputs after release |
| Valuation, age, performance, replacement | Stock regression, confidence/provenance, calculation coverage | Matched-population depreciation, true zero storage, reference fixtures |
| Organizations, users, assignment/history | Team/establishment and lifecycle paths; zero duplicate open assignments live | Concurrency and authorized reassignment tests |
| Invoices, warranty, file links | Upload/download/delete paths; private bucket; no missing/orphan objects live | Delete compensation, content validation, invoice provenance regression |
| CPU catalog, market data, enrichment | Source clients, matching/caching, schedules and job progression | Fetch restrictions, leases, actual completed-record accounting |
| Collection tokens, invitations, prefills | Expiry/hash/consumption, profile and scan persistence | Atomic invite use and identity trust rules |
| Web UX, FR/EN, mobile, accessibility | Structure/styles, translations, keyboard paths; 1440/375px fixture checks | Keyboard/dialog fixes, assistive-technology and real-content checks |
| Notifications, exports, audit logs | Event handlers, CSV encoding, error handling | Formula protection and reliable event persistence |
| Native collectors and updater | Python modules, PowerShell fallback, installers and release workflow | Signed artifact verification and supported-OS installation matrix |
| Security/privacy | RLS, grants, service-role boundary, HTML/URL inputs, tokens, local drafts | Implement findings; document retention and backup access rules |
| Performance and maintainability | Full-table rendering, response pagination, indexes, bundle sizes, module structure | Representative load test; measure before adding indexes or restructuring |
| CI/CD, hosting, recovery | GitHub runs, release metadata, live VPS/DNS, cloud function/migrations | Capacity, isolated deployment, secure backups and tested rollback |

## Validation and limitations

- Full quality command passed in an isolated copy of the current tracked files with LF line endings: formatting, lint, TypeScript, Deno formatting/type checking, JavaScript/Python syntax, frontend build, **185 passing frontend tests with 3 skipped**, and **16 passing collector tests**. The original Windows checkout fails formatting because of CRLF; its files were not mass-reformatted. This was a Windows run, not a Linux execution.
- Chromium fixtures reproduced HTML interpretation, the device selection race and inaccessible clickable rows. Stock valuation passed. No horizontal page overflow at 1440 or 375 pixels and no page errors occurred in those fixtures. This is not a full accessibility certification or exhaustive responsive test.
- Live database: all 24 public tables use RLS; invoice storage is private; 108 devices, 17 invoice rows and 15 stored objects; no missing/orphan objects or duplicate open assignment periods in the aggregate checks. Excess `enrichment_jobs` grants need cleanup, but no public row exposure was demonstrated.
- All 25 local migration identifiers match the live project. Live Edge Function metadata was checked; exact deployed source equivalence was not established. Today's three scheduled enrichment workflows succeeded, which does not prove every requested record was processed correctly.
- Dependency audit reports 12 advisory entries (9 high, 3 moderate), all in development dependencies. They are not 12 demonstrated production vulnerabilities. Native and Deno dependencies require separate supply-chain checks.
- No live login-abuse, injection, destructive lifecycle, load or migration tests were performed. No actual Defender incident was diagnosed. No native installer was executed, database export restored, or backup recovery demonstrated.

## Work status and next execution order

The audit and reproduction artifacts are local. No audit remediation was applied to application code, no commits/releases were published, and no DNS, VPS service or production database changes were made. The earlier stock valuation fix is preserved.

Proceed in this order: fix the P1 application defects and collector trust controls; provide sufficient VPS capacity; provision isolated staging using the migration runbook; restore and verify database plus files; test the complete application and collector paths; then carry out a scheduled cutover with a validated recovery point. The migration remains incomplete until those gates pass.
