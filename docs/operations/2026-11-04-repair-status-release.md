# Production release — In repair / En réparation

On 4 November 2026, the repair-status-only change was deployed to the existing production GitHub Pages and Supabase app. GitHub `main` commit: `4ac6d8d77e982409f00809f7a25640e77ad720c0`. Its tree matched the tested isolated release. The local audit changes were not published.

- Quality run `41810195296`, GitHub Pages deployment `41810195294`, and Supabase deployment `41810195377` all succeeded.
- Live read-only checks confirmed that `devices_status_check` allows `in_repair`, the deployed API contains the repair-status handler, and the live frontend serves the new filter and matching versioned assets. No inventory records were edited as part of verification.
- Applied migration: `20261104120000_device_in_repair_status.sql`. Before releasing the pending audit changes, reconcile their unpublished migration `20260915132127_audit_security_data_integrity.sql` with the live migration order and integrate against the new `main`.
