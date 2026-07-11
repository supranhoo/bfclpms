
# Plan — Extend Monthly Scorecard Trend into Summary + PIP Report (Option A)

Chosen approach: extend the existing **Reports → Monthly Scorecard → Trend** view rather than build a new page. Adds Business Unit, a PIP shortlist, an admin-configurable PIP threshold, and a Final-Score-only mode for PIP determination.

## Risk & Impact Report

- **Data Impact:** New `app_settings` row `pms_pip_threshold` (numeric, default 3.00). No schema changes; additive only. Reads `profiles.business_unit_id` + `business_units.name` (already available).
- **Workflow Impact:** None. Report is read-only. Existing trend behavior unchanged when PIP toggle is off.
- **UI Impact:** One new column (BU) in trend table, one BU filter in view, one "PIP threshold" numeric input in Admin → PMS Settings, one "PIP candidates" summary card + "Show PIP only" toggle above the table. Excel export gets the BU column and a second sheet for PIP shortlist.
- **Regression Risk:** Low. `useMonthlyTrend` currently uses the 8-stage fallback for the displayed average — we keep that for the trend cells (users rely on it) and compute a **separate `finalOnlyAvg`** used *only* for PIP eligibility. The visible Avg column is untouched.
- **Mitigation:** Feature-flag the PIP section behind presence of the threshold setting; unit tests cover threshold parsing, final-only average, BU grouping, and PIP filter.

## Scope

### 1. Admin setting
- Key: `pms_pip_threshold` in `app_settings` (jsonb value = number, e.g. `3.0`).
- Admin UI: add a small "PIP Threshold" numeric field on the existing PMS settings page (0.00–5.00, step 0.05).
- SSOT helper: `src/lib/pmsSettings.ts` → `getPipThreshold()` / `setPipThreshold()`.

### 2. Hook: `useMonthlyTrend`
- Add `businessUnitId` + `businessUnitName` to `TrendEmployee` (batch-fetch BU names like managers are today).
- Compute per-employee `finalOnlyAvg` from `review_submissions.final_score` only (ignoring the 8-stage fallback used for `avg`).
- Existing `avg` and monthly cells stay on the 8-stage fallback (no behavior change).

### 3. View: `MonthlyTrendView` + `MonthlyTrendTable`
- New **BU filter** (multi-select) alongside existing filters.
- New **"PIP only" toggle** and a **PIP summary card** ("N employees below X.XX") shown when threshold is loaded.
- Table gets a **Business Unit** column between Department and Reporting Manager.
- PIP row highlight (subtle red-tinted row) when `finalOnlyAvg < threshold`.

### 4. Excel export
- Add BU column to main sheet.
- Add second sheet **"PIP Candidates"** with: Emp Code, Name, Designation, Department, Business Unit, Reporting Manager, per-month Final Scores, Final-Only Avg, Threshold.

### 5. Tests
- `pmsSettings.test.ts` — threshold parse/clamp/default.
- `monthlyTrendFinalOnlyAvg.test.ts` — final-only average ignores manager/self fallbacks.
- `monthlyTrendPipFilter.test.ts` — PIP filter + BU filter combination.

## Files

**New**
- `src/lib/pmsSettings.ts`
- `src/test/pmsSettings.test.ts`
- `src/test/monthlyTrendFinalOnlyAvg.test.ts`
- `src/test/monthlyTrendPipFilter.test.ts`
- `supabase/migrations/<ts>_pms_pip_threshold_seed.sql` — seed default row in `app_settings` if absent.

**Edited**
- `src/hooks/useMonthlyTrend.ts` — add BU fields + `finalOnlyAvg`.
- `src/components/reports/MonthlyTrendTable.tsx` — BU column, PIP row styling.
- `src/components/reports/MonthlyTrendView.tsx` — BU filter, PIP toggle, PIP summary card, export changes.
- Admin PMS settings page (existing) — PIP threshold input.
- `.lovable/plan.md`, `DOCUMENTATION.md`, `POLICY.md` — record the new setting and PIP semantics.

## Rollback
Pure additive: revert the code edits and delete the `pms_pip_threshold` app_settings row. No destructive schema change.

## Not Applicable
Offline/optimistic UI, multi-tenant expansion, pagination (existing trend view is already bounded by month range + employee filters).
