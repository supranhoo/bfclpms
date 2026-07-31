# Master Change History — remove the 5,000-row export cap and start recording manager changes

Two separate defects. The second one is the serious one.

## 1. Manager changes are not recorded (capture gap)

Verified in the live database:

- ADR-213 created the broad 21-field audit function `log_profile_identity_change`
  (it covers `reporting_manager_id`, `functional_manager_id`, `department_id`,
  `designation`, grade, level, location, DOJ, mobile, portal access and more),
  **but that function was never attached to the employee table.**
- The table still runs the old 4-field trigger, which only fires on
  Name / Employee Code / Email / Active flag.
- Consequence: `profile.field_changed` has **0 rows**. Every reporting-manager
  change ever made is invisible to the report — nothing was lost in the report
  layer, it was never captured.

### Fix

- Replace the old 4-field trigger on the employee table with the existing
  21-field logger, so every one of those fields writes its own audit row with
  timestamp and actor.
- Keep the field list in one place so a new tracked field is a one-line change.
- Make the report label the new fields properly ("Reporting Manager",
  "Functional Manager", "Department", "Designation", …) and resolve manager and
  department IDs to **names**, not raw identifiers.
- Report categories: manager/department/designation moves get their own
  **"Reporting & Org"** category alongside Employee Details, Status, Workflow
  Mapping and Annual Review, so a user can filter for "who moved under whom".

### Honest limit on history

Past manager changes cannot be reconstructed — no before/after was ever stored
for them. Recording starts from the moment this ships. The report will carry a
one-line note stating the capture start date for these fields so nobody reads
an empty range as "no changes happened".

## 2. The 5,000-row export cap

The Excel export stops at 5,000 rows and warns "capped". The screen's paging is
unaffected — this is export-only.

### Fix

- Remove the 5,000 cap. The export keeps fetching server-side pages until the
  server returns the last page, so the file matches the filtered record count
  exactly.
- Keep it safe rather than unbounded: a high hard ceiling (100,000 rows,
  matching what one Excel sheet and the browser can comfortably hold) stays in
  place purely as a runaway guard. Realistic filtered volumes are far below it.
- Show real progress ("Exporting 12,400 of 38,910…") instead of a static label,
  since a large extract now takes several round trips.
- If the ceiling is ever genuinely hit, the warning names it and tells the user
  to narrow the date range — no silent truncation.

## Technical notes

- Migration: drop `trg_profiles_identity_audit`, create an equivalent trigger
  bound to `public.log_profile_identity_change()`; retire the legacy 4-field
  function so there is one capture path (the report keeps its legacy
  `profile.identity_changed` branch to preserve the 24 existing rows).
- Extend `public.resolve_change_value` to map `reporting_manager_id` /
  `functional_manager_id` → employee name, `department_id` → department name,
  `location_id`, `pms_grade_id`, `level_id`, `company_id` → their labels.
- Extend the category expression in `get_change_history` to route
  `reporting_manager_id`, `functional_manager_id`, `department_id`,
  `designation` into `reporting_org`.
- Client: `CHANGE_HISTORY_EXPORT_CAP` 5,000 → 100,000; `fetchChangeHistoryForExport`
  gains an `onProgress` callback; `CATEGORY_OPTIONS` and `FIELD_LABELS` in
  `src/lib/reports/changeHistory.ts` gain the new fields and category.
- Volume: the union currently sits at ~11k audit rows; the RPC already counts
  and pages server-side at 500/request, so no new query pattern is introduced.
- Write path is trigger-only and additive — rollback is re-pointing the trigger
  back to the old function; no data is destroyed.

## Tests and documentation

- Unit tests for the new field labels, manager/department value resolution, the
  `reporting_org` category, and the export pagination loop terminating on a
  short page instead of at 5,000.
- ADR-215, POLICY §CHG-HISTORY-CAPTURE-COMPLETENESS (a field shown in the
  employee editor must have a capture path), DOCUMENTATION.md v2.70.
