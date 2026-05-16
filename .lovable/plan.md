# Backfill Auditor KPI Assignments — April & May 2026

## Goal
Populate `audit_kpi_level_assignments` for **April 2026** (2,267 KPIs, 0 mappings) and **May 2026** (2,186 KPIs, 1 mapping) by inheriting auditor assignments from the most recent prior period that has them — same signature-matching logic used by the rollover engine.

## Matching Rule
For each target KPI in the period being backfilled, find a source KPI where:

```
source.employee_id  = target.employee_id
source.kra_name     = target.kra_name
source.kpi_name     = target.kpi_name
source.review_year/period = the most recent prior period (≤ target) that has an auditor assignment for that signature
```

If the source KPI has a row in `audit_kpi_level_assignments`, insert the same `auditor_id` for the target KPI. Skip if target already has an assignment.

## Approach: Admin-Only Edge Function (`backfill-audit-assignments`)

New edge function, admin-gated, two modes:
- `dry_run: true` → returns a summary (per-period counts of would-create / already-assigned / no-source-match / source-has-no-auditor) **without writing**.
- `dry_run: false` → performs the upsert with `onConflict: 'kpi_id', ignoreDuplicates: true` so any existing target mapping is preserved.

Inputs:
```
{ targets: [{year:2026,period:'April'},{year:2026,period:'May'}], dry_run: boolean }
```

Writes one row to `system_audit_logs` per execution: `action='AUDIT_ASSIGNMENTS_BACKFILLED'`, `performed_by=NULL` (system action), details payload with counts.

## Admin UI
Add a small panel **"Backfill Auditor Mappings"** inside the existing Rollover/Admin Settings area:
1. Period multi-select (defaults to April + May 2026).
2. **"Run Dry-Run"** button → shows the result table.
3. **"Apply"** button → enabled only after a successful dry-run for the selected periods. Confirms via `ConfirmDestructiveDialog`.
4. Result table columns: Period | Target KPIs | Would Create | Already Mapped | No Source Match | Source Has No Auditor.

## Safety Rails
- Idempotent: `onConflict: 'kpi_id', ignoreDuplicates: true` — re-running is harmless.
- Per-period chunked fetch (500 KPI ids per query) to avoid the 1000-row PostgREST cap.
- Admin-only via `_shared/admin-auth.ts`.
- Full audit trail entry.
- Dry-run is mandatory before Apply (UI-enforced).

## Tests
`src/test/backfillAuditAssignments.test.ts` — unit tests for the pure planner:
1. Inherits auditor when source signature has mapping.
2. Skips when target already mapped (preserved count).
3. Skips when source KPI exists but has no auditor mapping.
4. Skips when no source KPI exists for that signature.
5. Falls back to **most recent prior period** (e.g. May target → uses April if April has the mapping, else March).
6. Never crosses employee/KRA/KPI boundaries.

## Files
- **new** `supabase/functions/backfill-audit-assignments/index.ts`
- **new** `src/components/admin/BackfillAuditAssignmentsPanel.tsx`
- **edit** existing admin settings/rollover page to mount the panel
- **new** `src/test/backfillAuditAssignments.test.ts`
- **edit** `POLICY.md` — new §132.1 "Auditor Mapping Backfill"
- **edit** `DOCUMENTATION.md` — v2.66.11.20 RCA + how-to

## Risk & Impact
- **Data**: Insert-only into one table with UNIQUE(kpi_id). No updates, no deletes. Existing mappings preserved.
- **Workflow**: None — auditor queue UI already filters by KPI stage; new rows simply make April KPIs visible to the right auditor.
- **RLS**: No policy changes; edge function uses service role.
- **Regression**: Zero risk to rollover engine (separate code path). Dry-run protects against bad runs.
- **Mitigation**: Dry-run first, idempotent upsert, audit log, admin-only.

## Out of Scope
- No change to the rollover engine (already carries forward going forward).
- No re-assignment UI changes.
- June 2026 (only 47 KPIs) — included as optional checkbox if the user wants it covered.
