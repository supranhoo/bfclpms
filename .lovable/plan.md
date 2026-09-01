# Fix: "invalid input value for enum review_status: locked"

## What is happening

Clicking **Preview rename** in the group definition editor fails with
`invalid input value for enum review_status: "locked"`.

Verified cause: `public.kpis.status` is of enum type `review_status`
(`kra_set, self_review, manager_check, functional_manager_check, audit, approved,
management_review, skip_level_check, hr_pms_review`). The two rename functions
shipped with ADR-334 compare that column against `('locked','approved_by_manager')`,
which are values of a *different* enum (`kpi_status`). Postgres rejects the literal
at execution time, so the preview never runs — and the same comparison sits in the
apply path, so the rename itself would fail the moment it is used with the
"skip locked rows" option.

Affected code (both in the same migration):
- `public.preview_kpi_range_correction` — locked-row count (line 57)
- `public.correct_kpis_range` — include/skip filters (lines 135, 143)

## 5-Why

1. Why did preview fail? The SQL compares `kpis.status` to `'locked'`.
2. Why is that invalid? `kpis.status` is `review_status`, which has no `locked`.
3. Why was `locked` used? It was copied from the `kpi_status` vocabulary used elsewhere.
4. Why wasn't it caught? The literal is only cast at runtime, and no test exercised
   the rename RPCs against the live enum.
5. Why no test? The rename path had no server-side regression test.

## The fix

### 1. Correct the lock predicate (migration, replace both functions)
Use the project's canonical lock rule, the same one
`bu_console_group_edit_definition` already applies:

> a row is locked when it has a final score (`review_submissions.final_score IS NOT NULL`)
> or its `status` has moved past `kra_set`.

- `preview_kpi_range_correction`: `locked_rows` counted with that predicate via a
  `LEFT JOIN review_submissions`.
- `correct_kpis_range`: `p_include_locked` gates on the same predicate, so preview
  counts and apply behaviour stay identical.

No signature change, no client change — the dialog keeps calling the same RPCs.

### 2. Regression test
Add a test asserting every enum literal used against `kpis.status` in these
functions is a member of `review_status`, plus a preview call that returns rows
instead of raising.

### 3. Docs
ADR-338, `POLICY §KPI-RENAME-LOCK-PREDICATE`, DOCUMENTATION.md version history.

## Risk and impact

- **Data:** none from the preview fix (read-only). The apply path changes only which
  rows are *skipped* when the admin unticks "include locked" — it never widens the
  write set beyond what the console already permits.
- **Workflow / UI:** unchanged; the dialog's "N locked rows" badge starts showing a
  real number instead of erroring.
- **Regression risk:** low — two functions, both replaced atomically.
- **Rollback:** re-run the previous function bodies; no schema change.

## Technical notes

- Single migration with `CREATE OR REPLACE FUNCTION` for both functions
  (`SECURITY DEFINER`, `SET search_path = public` preserved, grants unchanged).
- The screenshot also shows "0 rows to rename" for Jul 2026 → Jun 2027; that count
  comes from the same broken preview, so it should populate once the predicate is
  fixed. If it still reads zero afterwards, that is the separate legacy-name
  matching issue and will be diagnosed before any further change.
