

## Plan — Fix HR PMS Dashboard Stat Counts and Per-Employee Progress Bar

### Root Cause Analysis

**Issue 2 (HR PMS Reviewed = 0, also affects Auditor / Management views):**
`useKpisByPeriodRanges` (used by the dashboard) selects KPIs via `SLIM_KPI_SELECT` in `src/hooks/useKpis.ts` (lines 158–167). That column list **omits** `hr_pms_score`, `audit_score`, `management_score`, `manager_score`, `skip_level_score`. The stats logic in `EmployeeSelectorGrid.tsx` (lines 885, 924, 956) tries to count "reviewed" via:

```ts
if ((k as any).hr_pms_score !== null && (k as any).hr_pms_score !== undefined) reviewed++;
```

Since the field is never fetched, it is always `undefined`, so the counter is permanently **0**. "Total KPIs" (595) is correct because it just counts rows; only the score-signature counters are broken.

**Issue 1 (some employee cards green, some not):**
In HR PMS view, `getProgressSegments` (line 1179) maps:
- `done` → `badge3` = KPIs in stages **strictly after** `hr_pms_review`
- `inProgress` → `badge2` = KPIs currently at `hr_pms_review`

The "X/X" label rendered on the bar is `clearedKraSet/total` (KPIs past `kra_set`), which has nothing to do with HR PMS. Result: an employee whose KPIs are all sitting at `manager_check` shows "27/27" with a fully **dark** bar (because nothing is at or past HR PMS yet), while an employee with even one KPI at `hr_pms_review` shows a green/amber segment. This is technically "correct" given the segment definitions but is visually misleading and inconsistent with the stat semantics fixed above.

### Fix

**A. Backend / Data Layer** — `src/hooks/useKpis.ts`

Extend `SLIM_KPI_SELECT` to include the five reviewer-stage score columns so any consumer that needs to detect "has been reviewed at stage X" works correctly:

```text
... existing columns ...,
manager_score, skip_level_score, hr_pms_score, audit_score, management_score,
... kra_categories, profiles ...
```

These are small numeric/null columns; payload impact is negligible vs. the `*` selects already used elsewhere.

**B. Per-employee progress bar** — `src/components/review/EmployeeSelectorGrid.tsx`

Rework `getProgressSegments` so the progress bar reflects **stage-relative progress for the active reviewer view**, using the workflow stage list per employee:

- `done` = KPIs whose status is at or beyond the current view's review stage (i.e. signed off by this reviewer or forwarded onward). For HR PMS, that means status is in `stages.slice(stages.indexOf('hr_pms_review') + 1)` **OR** `hr_pms_score IS NOT NULL` (covers approved-with-score signature).
- `inProgress` = KPIs currently sitting at the reviewer's stage (e.g. `hr_pms_review`).
- `pending` = KPIs in workflow stages strictly **before** the reviewer's stage but already past `kra_set`/`self_review` (i.e. waiting upstream — shown as muted track).
- The label switches from `clearedKraSet/total` to `done/total` so it matches the green segment.

Audit and Management views get the symmetric treatment using `audit_score` / `management_score` and `audit` / `management_review` stage anchors.

**C. Stat-card counters** — same file, lines 885/924/956

Now that `hr_pms_score` (and siblings) are actually present in `periodKpis`, the existing `(k as any).hr_pms_score != null` checks start working. Remove the `as any` casts and type them properly via the existing `Kpi` interface (already declares `hr_pms_score: number | null`).

**D. Regression test** — `src/test/bugBountyFixes.test.ts`

Add **BUG-020**: assert that `SLIM_KPI_SELECT` contains `hr_pms_score`, `audit_score`, `management_score`, `manager_score`, `skip_level_score`. This pins the contract so a future trim of the slim select doesn't silently zero out reviewer dashboards again.

**E. Mock data** — `src/components/review/__tests__/EmployeeSelectorGrid.stats.test.tsx` (new)

Mock a small set of KPIs across stages with and without `hr_pms_score` populated; assert:
- `stat3` ("HR PMS Reviewed") counts only KPIs with non-null `hr_pms_score`.
- `EmployeeProgressBar` renders a green segment when the employee has any HR-PMS-or-later KPI, regardless of whether any KPI is currently *at* `hr_pms_review`.
- `done/total` label matches the green segment width.

### Risk & Impact Report

- **Data Impact:** None — additive SELECT columns only, no schema/RLS change. All five fields already exist in the `kpis` table and are returned by other queries (`SELECT *`).
- **Workflow Impact:** None. Counters move from incorrect 0 to correct values; no permissions or state transitions change.
- **UI/UX Consistency:** Improved. Per-employee bar now agrees with the top stat cards and with the stage the reviewer is actually in. Other views (Team, Skip-Level) keep their existing 2-tier segment behavior.
- **Regression Risk:** Low. The slim select expansion is the only cross-cutting change; it can only *add* fields to existing query results, not remove or rename them. The progress-bar refactor is scoped to HR PMS / Audit / Management branches.
- **Mitigation:** Regression test pins the slim select contract; component test pins the stat and bar semantics.

### Files Changed

| File | Change |
|---|---|
| `src/hooks/useKpis.ts` | Add `manager_score, skip_level_score, hr_pms_score, audit_score, management_score` to `SLIM_KPI_SELECT` |
| `src/components/review/EmployeeSelectorGrid.tsx` | Rework `getProgressSegments` for HR PMS / Audit / Management; switch bar label to `done/total`; remove `as any` casts on score fields |
| `src/test/bugBountyFixes.test.ts` | BUG-020 — pin slim-select score columns |
| `src/components/review/__tests__/EmployeeSelectorGrid.stats.test.tsx` (new) | Stat-card and progress-bar regression tests |
| `DOCUMENTATION.md` | v2.66.7.20 — Reviewer dashboard stat counters and progress bar fix |
| `POLICY.md` | §91 — Slim KPI select must retain all stage-score signature columns; per-stage progress bar must reflect stage-relative completion |

### Out of Scope

- The "Pending Review = 0 / In HR PMS Review = 0" cards in the screenshot are correct given the data state (no KPIs currently at or before `hr_pms_review` for visible employees) and are not changed.
- No changes to RLS, workflow engine, or score-fallback chain.

