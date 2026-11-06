# GitHub schedule restoration — 12 October 2026

The live GitHub API reported `disabled_inactivity` on all three inventory refresh workflows. The repository itself remained public, enabled and unarchived. The last scheduled runs on 23 September all succeeded; the last repository push was 24 July.

Restored using the owner's existing GitHub CLI login, then verified all three workflow states as `active`:

- 308394385 — Sync CPU benchmark scores
- 311136522 — Sync authoritative CPU release dates
- 311275994 — Refresh fleet prices and valuation

No manual enrichment run was dispatched, no source changes were published, and no API/database deployment was performed. The existing daily schedules are enabled again; successful execution will be established by their subsequent run results.

GitHub automatically disables scheduled workflows in public repositories after 60 days without repository activity. For dependable production scheduling, move these jobs to the planned VPS scheduler with secure credentials and monitoring rather than generating artificial commits to keep GitHub active.

Reference: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
