## Goal

Restructure the **Calculate Increment %** tab so triggering a run and reviewing runs are separate workflows, support multi-employee scope, add a "Latest Calculations" view (one latest row per employee per AY), and allow safe admin edit/delete of result rows. No changes to scoring, slab, ineligibility, or confirmation logic.

## Risk & Impact Report

- **Data**: One additive migration on `increment_run_items` adds three nullable columns — `manually_edited boolean default false`, `edited_by uuid`, `edited_at timestamptz`. No backfill, no destructive change. RLS already permits admin update + delete; no policy changes needed.
- **Workflow**: Edge function gains a new optional `employee_ids: string[]` field; existing `employee_id` keeps working (back-compat). Scope snapshot gains `scope: 'multi'` variant.
- **UI/UX**: All changes are scoped to `CalculateIncrementTab` in `src/pages/incentive/IncrementInputs.tsx`. The outer "Calculate Increment %" tab gains an inner `Tabs` (Run Calculation / Run Log). Latest Calculations becomes the default view on the Run Log side. No route, permission, or sidebar changes.
- **Regression**: Run-history rendering, single-employee runs, and Export Excel preserved. Edit/Delete are gated by existing admin/hr_pms RLS. Latest-Calculations query reuses existing tables — no derived materialised view.
- **Mitigation**: Unit test for "latest per employee per AY" selector + edge-fn input parsing for `employee_ids`. Manual smoke: run all → run multi → run single → edit a row → delete a row → export both views.

## Scope

Only `CalculateIncrementTab` (the second tab on `/incentive/IncrementInputs`). `EnterInputsTab`, formulas, slab/method/criteria, confirmation logic — untouched.

## Steps

### 1. Backend: extend edge function to accept `employee_ids`
`supabase/functions/compute-increment/index.ts`
- Extend `RunBody` to `{ assessment_year, employee_id?: string|null, employee_ids?: string[]|null }`.
- Resolve a canonical `scopedEmployeeIds: string[] | null`:
  - `employee_ids` (validated UUIDs, deduped) → use it
  - else legacy `employee_id` → wrap as `[employee_id]`
  - else `null` → all employees
- Replace `.eq('id', scopedEmployeeId)` with `.in('id', scopedEmployeeIds)` when array present.
- Store scope snapshot:
  - all → `{ scope:'all' }`
  - 1 id → `{ scope:'single', employee_id }` (unchanged — keeps log back-compat)
  - >1 → `{ scope:'multi', employee_ids: [...], count: N }`
- No change to per-employee compute loop.

### 2. Hook layer
`src/hooks/useIncrementRuns.ts`
- `useTriggerIncrementRun`: accept `{ assessment_year, employee_ids?: string[] | null, employee_id?: string | null }` and forward to the edge function.
- New `useLatestIncrementResults(year)` — fetches all `increment_run_items` for runs in the AY joined with `increment_runs`, then in JS keeps the row with the most recent `runs.triggered_at` per `employee_id`. Paged on the server via `fetchAllPaged` (small dataset bound to AY) and de-duped client-side; returns enriched rows with employee profile.
- New `useUpdateIncrementRunItem` — patches allowed fields only (`eligible_percent`, `increment_amount`, `revised_salary`, `remarks`, `eligibility_status`) + sets `manually_edited=true, edited_by=auth.uid(), edited_at=now()`.
- New `useDeleteIncrementRunItem` — `delete().eq('id', id)` then invalidate `['increment-run-items', runId]` + `['latest-increment-results', year]`.
- `useExportIncrementRunItems` stays; add `useExportLatestIncrementResults(year)` mirroring it.

### 3. Schema migration (additive only)
New migration `add_manually_edited_to_increment_run_items.sql`:
```sql
ALTER TABLE public.increment_run_items
  ADD COLUMN IF NOT EXISTS manually_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;
```
No RLS change (admin/hr_pms UPDATE policy already in place).

### 4. UI: split Calculate Increment % into inner tabs
`src/pages/incentive/IncrementInputs.tsx` (`CalculateIncrementTab`):

```text
Calculate Increment % · AY 2025-26
┌──────────────────────────────────────────────┐
│  [ Run Calculation ]  [ Run Log ]            │
├──────────────────────────────────────────────┤
│  (active sub-tab content)                    │
└──────────────────────────────────────────────┘
```

#### 4a. Run Calculation sub-tab
- Card: AY context (read-only label), Scope select (`All Employees` / `Selected Employee(s)`), employee multi-select (only when "Selected"), Run button, helper "Choose scope and run calculation."
- Employee multi-select: reuse `MultiSelectFilter` pattern but bind to employee list (label = `Name (Code)`, value = id). Selected employees shown as removable chips below the trigger. Search hits name **or** code.
- Run disabled while pending OR (scope=selected AND list empty).
- On success, auto-switch to Run Log sub-tab and auto-select the new run.

#### 4b. Run Log sub-tab
Two views, controlled by a small segmented control at the top:
- **Latest Calculations** (default) — one row per employee for the AY, sourced from `useLatestIncrementResults(year)`. Renders the same column set as Run Details.
- **Historical Run Log** — existing runs table (Triggered At, Scope, Status, Summary, Action/View). Clicking View loads "Run Details" panel below (existing component).

Scope cell rendering:
- `all` → `All Employees`
- `single` → `Selected: <Name> (Code)`
- `multi` → `Selected: N employees` (tooltip lists names; resolved from cached employees)

Both views share the **Run Details / Latest Calculations** table component with paginated rows and full column set per spec:
Employee, Code, PMS Score, Rating Band, Slab %, Eligibility, Ineligibility Reason, Method, Eligible %, Current Salary, Increment Amount, Revised Salary, Conf. Increment, Final Eligible Months, Treatment Applied, Remarks, **Actions**.

#### 4c. Row actions
- **Edit** (pencil icon) → opens `IncrementResultEditDialog` with the 5 allowed fields. On save, calls `useUpdateIncrementRunItem`. A subtle "Edited" badge renders on rows where `manually_edited`.
- **Delete** (trash icon) → uses existing `ConfirmDestructiveDialog` (project standard) → calls `useDeleteIncrementRunItem`. Only removes the `increment_run_items` row; never touches `increment_inputs`, `profiles`, scoring, or configs.

#### 4d. Export Excel
Button lives in the active panel header:
- Latest Calculations view → exports all latest-per-employee rows for the AY (`useExportLatestIncrementResults`).
- Historical run view → exports all rows for the selected run (existing path).
- Both call `downloadXlsx` with the same column set used in the table.

#### 4e. Empty states (exact copy)
- Run Log historical: `No calculation runs yet.`
- Run Details: `No calculated rows found for this run.`
- Latest Calculations: `No latest calculations found for this assessment year.`

### 5. Tests
- `supabase/functions/compute-increment/employee_ids_scope_test.ts` — asserts:
  - `employee_ids: ['u1','u2']` filters profiles to those 2.
  - `employee_id: 'u1'` still works (back-compat).
  - Neither field → all employees.
- `src/lib/__tests__/latestIncrementResults.test.ts` — given fixture of 3 employees × 2 runs, returns 3 rows from the later run only.

### 6. Documentation
- `DOCUMENTATION.md` — new section "Calculate Increment %: Run Calculation / Run Log / Latest Calculations" describing scope variants and edit/delete contract.
- `POLICY.md` — note that Latest Calculations is the canonical "current result" per employee; historical runs are immutable for audit except via explicit row delete/edit, which sets `manually_edited=true`.
- ADR-071 — UI restructure + multi-employee scope + row edit/delete.
- `mem/features/incentive/calculate-increment-tabs` — short memory file; add to `mem/index.md`.

## Out of Scope (Constraints respected)

No change to: PMS score derivation, rating-band/slab logic, ineligibility-criteria engine, confirmation-treatment adjuster, permissions/routes, removal of all-employee runs, removal of Excel export, or deletion of historical run logs.

## Rollback

- UI: revert `IncrementInputs.tsx` + new dialog/hook files.
- Edge function: revert to single `employee_id` branch (back-compat means old payload still works during partial rollback).
- Migration is additive (new nullable columns) — safe to leave in place even if UI is reverted.
