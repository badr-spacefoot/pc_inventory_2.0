# AAS skill selection and audit method

The audit used the requested Agentic Awesome Skills (AAS) catalog, version 16.1.0. The composed manifest records the catalog digest, project profile and 14 selected skills. Full selected skill content was read; capabilities were selected for the actual vanilla DOM / TypeScript / Deno / Supabase / Python application, not inferred React or native-mobile frameworks.

| Capability | Applied skill | Selection rationale |
|---|---|---|
| Coordinated full review | comprehensive-review-full-review | Explicitly supports specialized parallel review; backend, frontend and collector reviews were bounded and consolidated |
| Architecture | architect-review | Review current boundaries and operational tradeoffs without requiring a rewrite |
| Typed application core | typescript-pro | Strict domain/service contracts alongside the existing JavaScript DOM layer |
| IT inventory rules | domain-modeling | Inventory catalog candidates concerned warehouse/retail domains; explicit IT lifecycle/valuation invariants are more appropriate |
| Database/platform | supabase | Schema, RLS, service-role and platform migration behavior; custom auth distinguished from Supabase Auth |
| External sources | api-integration | HTTP trust, timeouts, limits, redirects, retry and endpoint migration |
| Tests | testing-qa | Risk-based regression/integration coverage rather than only test counts |
| Security | security-auditor | Trace actual input and privilege boundaries; avoid asserting exploitability from keywords |
| Accessibility | accessibility-compliance-accessibility-audit | Keyboard/semantics/dialog review applicable to vanilla DOM and desktop controls |
| Deployment | deployment-procedures | Concrete backup, staged verification, cutover and rollback gates |
| Repository maintenance | repo-maintainer | Preserve existing stock fix, distinguish local checks from published/deployed state |
| Desktop implementation | python-pro | Tkinter callback lifetime, subprocess/networking, packaging and privacy behavior |
| Privacy | privacy-by-design | Minimize live data inspection, review local drafts/logging/retention |
| Performance | performance-profiling | Separate observed resource limits from unmeasured application latency |

Catalog search covered architecture, TypeScript, inventory, Supabase, API integration, testing, security, accessibility, deployment, code review, Python, privacy and performance, including alternative candidates before selection. Generic architecture/design and API-security candidates overlapped the selected reviewers; broad production-rewrite and React-specific approaches were not suitable. Python packaging guidance centered on package distribution would not substitute for native signed installer checks.

`webapp-testing` was additionally read for bounded browser verification. Its local server helper was inspected through `--help`. The available bundled Node Playwright runtime was used because Python Playwright was unavailable. Synthetic fixtures mocked the API and blocked all external requests; the tests did not authenticate to production or modify employee records.

Specialists produced findings with source references, while the parent verified live aggregate database state, GitHub metadata, shared VPS/DNS state and the full quality command. Conflicting or initially uncertain observations were reconciled in the final reports. No skill-based approval requirement stopped the audit; remaining deployment blockers are the concrete technical gates described in the runbook.
