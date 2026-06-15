# Plan — Carry KRA Score in Annual Review Templates

## Goal

Inside the Annual Review **Template Editor** (Admin), allow a System Score to be configured as a **Carry KRA Score**. When that score is used in an instance, the system fetches the employee's existing **month-wise final achieved KRA score** for the fiscal year tied to the cycle, displays the breakdown, and feeds an aggregated value into the appraisal totals.

## Assumptions

- Fiscal cycle is July–June (project memory).
- `annual_review_cycles.review_year` identifies the fiscal year that should be aggregated.
- "Final achieved score" per KPI per month = `review_submissions.final_score` (immutable once approved) using the universal scoring cascade as fallback (already implemented in `src/lib/scoring/universalScore.ts`).
- Monthly KRA score = weight-aware aggregate of an employee's KPIs whose `review_period = <month>` and `review_year = cycle.review_year`, excluding `is_na` per existing N/A governance.
- This is **read-only carry**: no edits to historical PMS data; nothing recomputes `final_score`.

## Pushback / Clarifications

1. **Aggregation level** — should the carry value be:
  - (a) the **overall** weighted average across all 12 months (single number fed into the System Score), or
  - (b) **selectable month range** (e.g. last 6 months) configured on the template?
   I will default to **(a) overall weighted average of available months**, with the per-month grid visible for audit. Confirm if you want (b).  
    
  This to be (b) **selectable month range**
2. **Weight conversion** — System Scores have a `weight` cap (max % points). The carry value will be scaled Averahge of Monthly Score. Confirm.
3. **KRA filter** — include all KRAs, or only KRAs explicitly mapped to the employee in the cycle's fiscal year? Default: **all KRAs the employee had KPIs for** in that review_year.

## Risk & Impact Report

- **Data**: No schema for historical PMS tables. One additive JSONB column on `annual_review_instances` to cache the carried snapshot per system_score id (`carry_score_snapshots jsonb default '{}'`). Template gains a new `source = 'carry_kra'` value plus optional `carry_config` per system score. No destructive change.
- **Workflow**: Read-only fetch; does not alter PMS workflow status or `final_score` immutability.
- **UI/UX**: Template editor gets a "Carry KRA Score" source option with a config popover. Reviewer/HR side gains a collapsible "Monthly KRA Breakdown" panel inside `SystemScoresPanel` when the score uses this source.
- **Regression risk**: Low — additive enum value + new branch in `SystemScoresPanel`. Existing manual sources untouched.
- **Scalability**: One employee × 12 months × N KPIs. Fetched once per instance load; result cached in `carry_score_snapshots` so subsequent loads are O(1).
- **Security/RLS**: Reads use existing `review_submissions` policies. Snapshot writes restricted to instance owner / HR via existing RLS on `annual_review_instances`.

## Step-by-step Plan

### 1. Types & SSOT (`src/types/annualReview.ts`)

- Extend `TemplateSystemScore.source` literal union with `'carry_kra'`.
- Add optional `carry_config?: { aggregation: 'overall_avg' | 'last_n_months'; lastN?: number; excludeNa?: boolean }`.

### 2. Service (`src/services/annualReview/carryKraScore.ts` — new)

- `fetchMonthlyKraScores(employeeId, fiscalYear)` → `{ month: string; avgPct: number; weightedTotal: number; kpiCount: number }[]` ordered Jul…Jun.
- Implementation: query `review_submissions` join `kpis` filtered by `employee_id`, `kpis.review_year = fiscalYear`, `is_na = false`. Aggregate weight-aware monthly % using existing `universalScore` helper.
- `computeCarryValue(monthly, weight, cfg)` → numeric scaled to `weight` cap.

### 3. Template Editor (`TemplateEditorDialog.tsx`)

- In the System Scores table, change Source input → `Select` with options: `Manual`, `Safety`, `HR`, `Carry KRA Score (auto-fetched)`.
- When `carry_kra` chosen, show a small inline config (aggregation mode + lastN). Disable manual value entry downstream.

### 4. SystemScoresPanel (`SystemScoresPanel.tsx`)

- For each score where `source === 'carry_kra'`:
  - Lock numeric input (read-only).
  - Render a collapsible **"Monthly KRA Breakdown"** table: month, KPI count, avg %, contribution to weight.
  - Loading + empty states (e.g. "No PMS submissions found for FY {year}").

### 5. Instance load hook (`useAnnualReviewInstance.ts` or service composition)

- After instance + template load, for each `carry_kra` system score: if snapshot missing/stale, call service, store in `values[scoreId]`, and persist snapshot on save.

### 6. DB Migration (additive)

- `ALTER TABLE public.annual_review_instances ADD COLUMN IF NOT EXISTS carry_score_snapshots jsonb NOT NULL DEFAULT '{}'::jsonb;`
- No new tables; no RLS changes (column inherits).

### 7. Tests

- Unit: `carryKraScore.test.ts` — happy path (all 12 months), partial months, all-NA exclusion, weight scaling, lastN config.
- Component: snapshot test that `SystemScoresPanel` renders the monthly breakdown only for `carry_kra` sources.
- Mock fixtures: synthetic employee with mixed monthly submissions.

### 8. Docs & Policy

- **DOCUMENTATION.md** → new subsection under "Annual Review → Templates → System Scores: Carry KRA Score" describing source, config, snapshot caching, fiscal mapping.
- **POLICY.md** → rule: "Carry KRA Score is read-only and sourced from the employee's PMS `final_score` cascade for the cycle's fiscal year; N/A KPIs are excluded; snapshot is immutable once the annual instance reaches `pending_hr`."
- **Memory** → add `mem://features/annual-review/carry-kra-score`.

### 9. Rollback

- Drop column `carry_score_snapshots` (additive, safe).
- Revert files in steps 1–5 and 8.

## UI Change Summary

- **Template Editor** → System Scores row: Source becomes a dropdown; selecting "Carry KRA Score" reveals a config chip and disables manual entry on the appraisal side. Visible only inside the Template dialog.
- **Reviewer / HR appraisal view (`SystemScoresPanel`)** → New collapsible monthly grid under any carry_kra score. Inputs locked. Mobile: stacked accordion.
- **No nav, no new route.**

## Out of Scope

- Editing/overriding historical PMS scores.
- Cross-cycle carry (only the cycle's own fiscal year is fetched).
- Bulk re-snapshot UI (snapshot refresh happens on instance load while editable).