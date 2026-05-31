## 1. Assumptions
- Configured global increment method for AY 2025-26 is **prorated_doj** (verified in `increment_method_configs`).
- Slab `4.5–5` has `prorate_on_doj = true` (verified), so the per-slab override is NOT the cause.
- Vivek Kumar Dansena (101784) shows `Method = Full`, `Eligible % = 20%`, `Final Eligible Months = 9.23` in the screenshot.

## 2. Root Cause Analysis

Direct DB inspection of `increment_method_configs` for AY 2025-26:

| version | method | status |
|--------:|--------|--------|
| 1 | prorated_doj | **active** |
| 2 | prorated_doj | archived |
| 3 | prorated_doj | **active** |

**Two rows are simultaneously `status = 'active'`** for the same `(assessment_year, scope)`.

In `supabase/functions/compute-increment/index.ts` (line 312):
```ts
admin.from('increment_method_configs')
  .select('*')
  .eq('assessment_year', assessment_year)
  .eq('status', 'active')
  .maybeSingle()
```
`maybeSingle()` returns `data = null` (PGREST116 — "multiple rows returned") when more than one row matches. Line 335 then silently defaults:
```ts
const methodType = (methodCfg.data as any)?.method ?? 'full';
```
So the engine ran in **Full** mode, producing `Eligible % = 20%` instead of the prorated `20 × 9.23 / 12 ≈ 15.38%`.

Why duplicates exist: `useSaveIncrementMethod` only archives the `existing` row passed in by the caller. If the active-config hook ever returned a single row while a second active row was already present (from a prior copy/import/migration), the save path inserted v3 without archiving v1. Result: two active rows.

This is a **silent fail-open** — a configuration anomaly degrades correctness without any user-visible error.

## 3. Risk & Impact Report
- **Data Impact**: All AY 2025-26 increment runs executed since the duplicate was introduced are wrong for every employee whose matched slab has `prorate_on_doj = true` AND `monthsServed < 12`. Underlying master data is fine; only `increment_run_items` rows are affected.
- **Workflow Impact**: None — recompute regenerates results; existing run history is preserved.
- **UI/UX Impact**: None visually; numeric values change after recompute.
- **Regression Risk**: Low. The edge-function change is a deterministic tie-breaker (`order by version desc limit 1`) that matches existing single-row behaviour when no duplicates exist.
- **Scalability**: No change; same query shape, one extra `order`/`limit`.
- **Mitigation**: Unit tests for both the edge-function resolver and the save hook; DB partial-unique index to prevent recurrence.

## 4. Correction Plan (step → verification)

### Step A — Data repair (migration, one-off)
- Within `increment_method_configs`, for each `(assessment_year, company_id, division_id, business_unit_id, category_id, level_id, location_id)` group where `status = 'active'`, keep only the row with the highest `version` active; archive the rest.
- Add a partial unique index:
  ```sql
  CREATE UNIQUE INDEX increment_method_configs_one_active_per_scope
    ON increment_method_configs (assessment_year,
       COALESCE(company_id,'00000000-0000-0000-0000-000000000000'),
       COALESCE(division_id,'00000000-0000-0000-0000-000000000000'),
       COALESCE(business_unit_id,'00000000-0000-0000-0000-000000000000'),
       COALESCE(category_id,'00000000-0000-0000-0000-000000000000'),
       COALESCE(level_id,'00000000-0000-0000-0000-000000000000'),
       COALESCE(location_id,'00000000-0000-0000-0000-000000000000'))
    WHERE status = 'active';
  ```
- **Verify**: `SELECT count(*) … GROUP BY scope HAVING count > 1` returns 0 rows.

### Step B — Edge function hardening (`supabase/functions/compute-increment/index.ts`)
- Replace the `maybeSingle()` lookup with a deterministic latest-version pick:
  ```ts
  admin.from('increment_method_configs')
    .select('*')
    .eq('assessment_year', assessment_year)
    .eq('status', 'active')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  ```
- Replace the silent fallback. If `methodCfg.error` is non-null OR `methodCfg.data` is null AND any non-archived config row exists for the AY, fail the run with a clear message (`"Active increment method configuration not found / ambiguous for AY <year>"`) instead of defaulting to `'full'`. Pure missing-config (no rows at all) keeps the explicit `'full'` default with a `run_notes` entry stating "No method config configured → defaulted to Full".
- **Verify**: New Deno test in `supabase/functions/compute-increment/` seeds 2 active rows and asserts the resolver returns the higher version; seeds 0 rows and asserts a clean default with notes.

### Step C — Save hook fix (`src/hooks/useIncrementMethod.ts`)
- In `useSaveIncrementMethod`, before inserting the new version, archive ALL currently-active rows matching the scope (not just the `existing` row the caller fetched):
  ```ts
  await applyScope(
    supabase.from('increment_method_configs').update({ status: 'archived' }).eq('status', 'active'),
    scope,
  );
  ```
- Same change in `useCopyIncrementMethodFromYear`.
- **Verify**: Vitest covering "save when 2 active rows exist for scope ⇒ both archived, new version inserted active, only 1 active row remains".

### Step D — Recalculate impacted data
- Trigger a fresh **Run Calculation · All Employees** for AY 2025-26 from the UI. Existing historical run rows stay (audit trail); latest-view picks up corrected values.
- **Verify for Vivek 101784**:
  - Method = `Prorated: 20% × 9.23/12`
  - Eligible % ≈ **15.38%**
  - Increment Amount = current_salary × 15.38 / 100
  - Revised Salary = current_salary + increment_amount
  - Eligibility stays consistent with current absent-criterion state.

### Step E — Regression tests & mock data
- `compute-increment` Deno test: duplicate active configs → resolver picks latest version, applies prorated_doj end-to-end with months = 9.23 and slab 20% → expects 15.3833.
- `useIncrementMethod` Vitest: archiving sweep behaviour.
- DB migration test note in `docs/safety/phase1/…` (manual): unique index blocks a second active insert.

## 5. UI Changes
**Not Applicable.** No visible UI changes. Only the values inside the Calculated / Run Details table will become correct after Step D recompute. Column structure, tabs, layout untouched.

## 6. SSOT updates
- `DOCUMENTATION.md` → add note under Increment Engine: "Method config resolution = latest active version per scope (deterministic). Save path archives all prior active rows."
- `POLICY.md` → "Only one method config per (AY, scope) may be active at a time; enforced by partial-unique DB index."
- `docs/adr/ADR-071.md` → new ADR documenting RCA, fix, and rollback.
- `mem/features/incentive/…` → add memory `method-config-active-uniqueness`.

## 7. Rollback strategy
- Migration is additive (archive flips + new index). Rollback = drop the partial unique index; previously-archived duplicate rows can be re-activated manually if ever needed (not expected).
- Edge function & hook changes are surgical; revert by git revert of the two files.

## 8. Out of scope
- No change to slab math, criteria evaluation, confirmation-increment adjuster, or any UI tab.
- No change to per-slab `prorate_on_doj` semantics.
