## Root Cause

The increment engine (`supabase/functions/compute-increment/index.ts`, lines ~380–390) reads monthly PMS scores from the **`performance_reviews`** table:

```ts
const { data: prData } = await admin
  .from('performance_reviews')
  .select('employee_id, review_period, review_year, overall_score, status')
  .in('review_year', [startYear, endYear]);
```

…then `rollUpScores(monthly, …)` is applied. But that table is **empty** — confirmed by DB query: `SELECT count(*) FROM performance_reviews` returns **0 rows for all employees**, not just Jaspal.

The canonical scoring data actually lives in **`review_submissions`** (one row per KPI) and the monthly PMS score must be derived using:
- the standard **8-stage fallback chain** (`final → management → auditor → hr_pms → skip_level → manager → self`), and
- a **weighted average across non-N/A KPIs** using `kpis.weightage`.

This is exactly what the dashboard already does in `src/hooks/useEmployeeScoresForPeriod.ts` and what the matrix uses in `src/hooks/useKpiEmployeeMatrix.ts`. The increment engine was wired to a stale/unused rollup table that nobody is populating.

For Jaspal (101125), the real KPI data is present: Sep–Dec 2025 (13–14 KPIs each, fully reviewed by Auditor + Final), Jan–Mar 2026 (Management approved), Apr 2026 (in review). That's why he shows up in dashboards but the increment engine sees `pmsScore = null` → flags `no_score` with "No PMS score found".

## Impact

- **Every** completed run will show 0 eligible / N no_score for everyone with PMS data, regardless of criteria-exempt status.
- The "criteria-exempt" badge is a separate flag and is unrelated to the no_score bug.
- No data corruption — only `increment_run_items` are wrong; they are recomputed on every run.

## Fix Plan (edge function only — no schema change)

### Step 1 — Replace the data source in the edge function

In `supabase/functions/compute-increment/index.ts`, replace the `performance_reviews` block with a derivation from `review_submissions` + `kpis`:

```text
For each employee in scope:
  Fetch their KPIs in (review_period ∈ periodStrings, review_year ∈ [startYear,endYear]):
     select id, employee_id, review_period, review_year, weightage
  Fetch matching review_submissions by kpi_id (batched 500):
     select kpi_id, is_na, final_score, management_score, auditor_score,
            hr_pms_score, skip_level_score, manager_score, self_score
  For each (employee, period, year):
     weightedSum=0, totalWeight=0
     for each KPI in the period:
        sub = subMap.get(kpi.id)
        if !sub or sub.is_na: skip
        score = first non-null in [final, management, auditor, hr_pms, skip_level, manager, self]
        if score == null or weightage <= 0: skip
        weightedSum += score * weightage
        totalWeight += weightage
     if totalWeight > 0: push { score: round1(weightedSum/totalWeight), month }
```

Then keep the existing `rollUpScores(monthly, annualMethod, customMonths)` exactly as is — it already handles annual-method roll-up from monthly scores.

### Step 2 — Keep the 8-stage chain in one place

Add a small helper inside the edge function (or extract to `supabase/functions/_shared/bestScore.ts`):
```ts
function bestScore(s) {
  return s.final_score ?? s.management_score ?? s.auditor_score
      ?? s.hr_pms_score ?? s.skip_level_score ?? s.manager_score
      ?? s.self_score ?? null;
}
```
Mirror semantics of `useEmployeeScoresForPeriod.ts` exactly (same chain, same N/A exclusion, same `Math.round(x*10)/10`).

### Step 3 — Batching & limits

- Fetch `kpis` rows in batches of 500 employee_ids (`.in('employee_id', batch)`) to respect the 1000-row default and current convention used in `useKpiEmployeeMatrix.ts`.
- Fetch `review_submissions` in batches of 500 `kpi_id`s.
- Build `scoresByEmp: Map<empId, Array<{score, month}>>` once before the per-employee loop, identical to today.

### Step 4 — Preserve "no_score" semantics

Keep the existing branch:
```ts
if (pmsScore === null) {
  if (eligibility === 'eligible') {
    eligibility = 'no_score';
    reason = 'No PMS score found';
  }
}
```
This is now correct because `pmsScore` actually reflects the canonical scoring chain. Jaspal will get a real score and route to a slab.

### Step 5 — Verification

1. Re-run "Calculate Increment" for Jaspal (101125) for AY 2026.
2. Expected: a numeric `pms_score`, a `rating_band`, a `slab_percent`, `increment_amount > 0`, `eligibility = eligible` (since he's also criteria-exempt → criteria block skipped anyway).
3. Re-run for an employee with a known low/zero PMS score → confirm correct slab pickup.
4. Re-run for an employee with truly zero KPIs in the period → confirm `no_score` still fires.
5. Compare `pms_score` produced by the engine against the dashboard's monthly score for the same employee/period → they must match.

### Step 6 — Tests & docs

- Add `supabase/functions/compute-increment/pms_score_derivation_test.ts` — unit tests for `bestScore()` and the monthly aggregation (weighted-average, N/A exclusion, missing submission, all-N/A case).
- Update `DOCUMENTATION.md` "Increment Engine — Data Sources" section to state: monthly PMS score is derived live from `review_submissions` + `kpis` using the canonical 8-stage fallback chain. `performance_reviews` is **not** a source.
- Update `POLICY.md` PMS-scoring section: "Increment uses the same 8-stage chain as dashboards. There is no separate rollup table."
- Add a memory entry under `mem/features/incentive/` documenting the canonical PMS-score source for the increment engine.

## Risk & Impact

| Area | Impact |
|---|---|
| Data | None — only `increment_run_items` are recomputed on each run. Previous runs are historical snapshots and stay untouched. |
| Workflow | None — UI, RLS, and run/scope flow are unchanged. |
| UI/UX | Same screens; "View" + Export Excel will now show real `pms_score`, `slab_percent`, `eligible %`, `increment_amount` for employees who have reviews. |
| Regression | Low — change is confined to one block inside one edge function. The existing `rollUpScores`, slab picker, method engine, and confirmation adjuster are unchanged. |
| Performance | Two new batched `select`s per run (KPIs + submissions). For a Single-employee scope (e.g. Jaspal) this is ~30 rows total. For org-wide runs, batching at 500 keeps it well within DB limits. |
| Rollback | Revert the single edge-function file; no schema change to undo. |

## Out of Scope

- No change to the `criteria_exempt` flag, its UI badge, or the run-item schema.
- No change to slabs, methods, confirmation-increment logic, or general-eligibility gates.
- No backfill of `performance_reviews` — that table is unused and stays as is.

Awaiting approval to switch to build mode and implement.