---
name: admin-data-entry-timeline-rendering
description: ADMIN_DATA_ENTRY_* rows in the Review Timeline render strictly from metadata.fields_updated; *_rating colour bands suppressed; impersonal stages use "for X" not "on behalf of X"
type: feature
---
Review Timeline (`src/components/dashboard/KpiTimeline.tsx`) renders rows with `action` starting `ADMIN_DATA_ENTRY_` via `formatAdminDataEntryDetails`, which reads ONLY from `metadata.fields_updated` (written by `useAdminSubmitReviewData`). Never iterate `new_value` for these rows — the audit row stores the whole `review_submissions` snapshot and other stages' values would falsely appear as fresh edits.

Rules:
- Suppress every `*_rating` column. Those hold the derived RAG colour band (`red|yellow|green|blue`), NOT the 0–5 rating shown in the UI.
- One `Score:` / `Remarks:` / `Added Value:` line max (the role-specific one).
- `is_na = true` short-circuits to "Marked as N/A".
- "On behalf of X" wording (red) is reserved for `ADMIN_DATA_ENTRY_SELF` and `ADMIN_DATA_ENTRY_MANAGER` where admin actually impersonates a person. For impersonal stages (`HR_PMS`, `AUDITOR`, `MANAGEMENT`) use muted `· for X` instead — admin acts AS the stage, not on the employee's behalf.
- Legacy rows without `metadata.fields_updated` fall back to the generic renderer.
- Never mutate `new_value` / `metadata` in the DB to "fix" old rows — `kpi_audit_logs` is immutable (POLICY §104).