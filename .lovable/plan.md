## Goal
Resolve the two specific gaps Vivek hit in **Bulk Review → HR PMS, May 2026, search "5S"**:

1. **Leak in KPI-detail view** — opening the org KPI directly shows employees who are **not in HR PMS scope** at all.
2. **False-empty in Bulk Review** — after applying the HR PMS-ready filter + searching "5S", only **one** employee is visible even though several employees are genuinely pending at HR PMS for that org KPI.

This plan splits the diagnosis cleanly between the two surfaces and proposes one tight fix per gap so they don't bleed into each other.

## What the code already does (verified, read-only)
- `src/pages/review/BulkReviewDashboard.tsx` — `loadedRows` (L390-439) applies, in order: KRA → text search → hide-empty → hide-non-due → designation/grade/manager → multi-category → `myScopeOnly` (reviewer scope) → `adminStageReadyOnly`.
- `adminStageReadyOnly` is gated by `useStageReadyScope → rpc('stage_ready_kpis', …)`.
- `stage_ready_kpis(period, year, stage)` (SECURITY DEFINER, admin-guarded) returns `(kpi_id, employee_id)` **only** where:
  ```
  kpi_status = LAG(stage_text)  -- the immediate predecessor of hr_pms_review
  AND prev_stage IS NOT NULL
  ```
  Resolved per-employee via `get_employee_workflow(employee_id, period, year)`.
- Effect: a row is "HR PMS-ready" **only** when the employee's resolved workflow contains `hr_pms_review` AND the KPI's current status is the stage **immediately before** `hr_pms_review` in that template.

That is why the toggle tooltip in Vivek's screenshot reads "only KPIs currently waiting at hr pms in May 2026 are visible AND actionable. Upstream rows are hidden so they cannot accidentally be signed off."

## Hypotheses (one per conflict)

### Conflict 2 — Bulk Review "only one employee" for an org KPI
Most likely a real-data outcome of the RPC, NOT a bug:
- For an **org-level** KPI, every employee carries an independent `kpis` row that progresses on its own workflow. If only one employee's row currently has `kpi_status = predecessor(hr_pms_review)`, the RPC correctly returns one pair. Everyone else is either upstream (e.g. still at `audit`) or downstream (already past HR PMS) or on a template with no `hr_pms_review` stage.

Two real bug candidates inside that same surface:
- (a) `stage_ready_kpis` requires `prev_stage IS NOT NULL`. If a template has `hr_pms_review` as the **first** stage, it is silently excluded. Unlikely for production templates, but worth verifying for the templates Vivek's "5S" employees actually use.
- (b) Predecessor mismatch when a template skips a stage. E.g. workflow `self_review → audit → hr_pms_review → approved`: the predecessor of `hr_pms_review` is `audit`, so a KPI sitting at `manager_check` (because the employee was migrated mid-cycle) is NOT counted as ready even though it semantically is. We've hit similar shape bugs before (POLICY §115).

### Conflict 1 — KPI-detail view shows employees outside HR PMS scope
The KPI-detail / "Open KPI" surface today renders **every** `kpis` row for that `(kpi_name, period, year)` without intersecting against the employee's resolved workflow. For org KPIs this is wrong because:
- Employees whose template does **not** contain `hr_pms_review` are still listed under the HR PMS reviewer's KPI page.
- Inactive employees / cycle-skipped employees also appear.

The right gate is the same predicate `stage_ready_kpis` exposes for Bulk Review — the KPI-detail view should reuse the resolved-workflow check via `get_employee_workflow` (or the existing `useStageReadyScope` hook).

## Risk & Impact Report

| Area | Impact |
|---|---|
| Data | No schema change. Read-only investigation + a tightened client filter and (likely) one RPC tweak. |
| Workflow | No status/stage changes. The HR PMS reviewer will see a roster that **shrinks** to the genuine HR PMS-scope set — that is the intended correction (POLICY §115 parity). |
| UI/UX | No visual redesign. Pure scope/visibility tightening on the KPI-detail page; Bulk Review behaviour unchanged unless investigation finds RPC bug (b). |
| Regression risk | Medium — anything that hides rows in a sign-off surface needs a clear "X hidden" badge to avoid surprise. Mitigated below. |
| Scalability | None. `stage_ready_kpis` and `get_employee_workflow` already memoised; `useStageReadyScope` cached at 5 min. |
| Mitigation | Diagnostic query first, then targeted fix with a regression test (`bulkProcessedFilter.test.ts`-style). Sign-off path stays fail-closed. |
| Rollback | Each fix is a single file/function diff — straight revert. |

## Plan

### Step 1 — Pin down the actual "5S" KPI and its true HR PMS-pending set (read-only DB)
Vivek's screenshot shows KRAs *"Create & Implement New SOP"* and *"Employee Satisfaction"* — neither is "5S". I need the exact KPI name (or its `id`) and the company filter that was active. With that I will run:

```sql
-- A. All employees holding this KPI for May 2026
SELECT k.id, k.employee_id, p.full_name, p.employee_code, k.status,
       get_employee_workflow(k.employee_id,'May',2026) AS wf
FROM kpis k JOIN profiles p ON p.id = k.employee_id
WHERE k.review_period='May' AND k.review_year=2026
  AND lower(k.kpi_name) LIKE '%5s%';

-- B. The same set filtered through stage_ready_kpis
SELECT * FROM stage_ready_kpis('May',2026,'hr_pms');
```

A vs B gives the exact count Bulk Review *should* show and exposes (a)/(b) above if any.

### Step 2 — Fix conflict 2 only if Step 1 confirms a bug
- If A=B → behaviour is correct, the "1 employee" answer is honest. Action: improve the **badge** on the toggle so it reads e.g. "1 of 384 actionable now — N hidden as upstream/downstream" with a breakdown popover. No filter logic change.
- If A>B because of (a) first-stage-no-predecessor: change `stage_ready_kpis` predicate to `(prev_stage IS NULL AND kpi_status = 'kra_set') OR kpi_status = prev_stage`.
- If A>B because of (b) status-not-direct-predecessor: relax to `kpi_status IS NOT NULL AND this_idx > (index of kpi_status in same workflow)` — i.e. "the employee has completed every stage before `hr_pms_review`". Mirrors POLICY §115. Add fixture in `src/test/bulkProcessedFilter.test.ts` covering migrated-mid-cycle case.

### Step 3 — Fix conflict 1 (KPI-detail leak)
- Locate the KPI-detail/"Open KPI" page (likely `src/components/review/KpiReviewPanel.tsx` / its parent) that lists employees for the selected KPI.
- Add a reviewer-stage gate that filters the employee list through the same `get_employee_workflow` check that Bulk Review uses:
  - Reuse `useStageReadyScope(period, year, viewerStage, true)` when the viewer is acting as a reviewer stage (HR PMS / Audit / Manager / Skip-Level / Management).
  - For admin "full QA" view, keep the full list but tag each row with a chip — `In scope · Not in scope · Already past stage` — so the leak becomes information, not a sign-off hazard.
- Sign-off button on a "Not in scope" row stays **disabled** with tooltip "Employee's workflow does not include HR PMS".
- Test: `src/test/kpiDetailHrPmsScopeGate.test.ts` covering: included template, excluded template, already-past-stage, inactive employee.

### Step 4 — Documentation & policy
- `DOCUMENTATION.md` Version History entry.
- `POLICY.md`: extend §115 with a third clause — "Per-KPI detail views MUST apply the same reviewer-stage gate as Bulk Review. Admin QA mode may show out-of-scope rows but MUST visually tag them and block sign-off."

### Step 5 — UI breadcrumb on Bulk Review toggle (regardless of Step 2 outcome)
Reword the toggle tooltip and add a small breakdown chip next to it: `Hidden: N upstream · M past stage · K no HR PMS stage`. Pure UX clarity; no logic change. This addresses Vivek's surprise that "only 1 is visible" — even if it's correct, the *why* should be on-screen.

## UI Changes
- **KPI-detail (Open KPI)**: each employee row gains a small status chip (`In scope` / `Not in scope` / `Past stage`); sign-off disabled for non-actionable rows. No layout change.
- **Bulk Review HR PMS toggle**: tooltip text expanded; small breakdown chip appears next to the "X actionable" badge. No layout change.

## What I need from you to start Step 1
- The exact **KPI name** Vivek searched (the "5S" KPI's full title or `id`).
- Confirm the Company filter active in his session (or "All Companies").

Once those land I run the two SQL queries, confirm which of (a)/(b)/none applies, and ship Steps 2–5 in a single PR per conflict (two PRs total, sequenced).
