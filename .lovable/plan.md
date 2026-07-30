## Assumptions

- "This" in item 1 = the **Create Performance Improvement Plan** form (currently a cramped modal).
- Low-scoring KPIs come from the **same evaluation window** as the suggestion (anchor month + 3/6-month window), using the stored `review_submissions.final_score` (never recomputed client-side).
- "KPI without formula & scoring logic" = show only **KRA → KPI name** (and the score), never `criteria` / `r5..r0` / target text.
- PMS Policy = the DB-stored document (`app_settings.pms_policy_content`) edited via the existing Policy editor; it gets the §15 PIP draft already agreed in ADR-205/207.

## Risk & Impact Report

- **Data impact:** No schema change. `improvement_areas` stays a `text[]`; KPI selections are appended as `KRA — KPI` strings, so existing plans and reports are unaffected. Policy text is a single `app_settings` row update (previous text preserved for rollback).
- **Workflow impact:** None. Creation guardrails (duration, cadence, overlap, RM2 gate) are untouched.
- **UI/UX impact:** New route replaces the modal; Suggestions and "New PIP" navigate to it. Full responsive layout, sticky action bar.
- **Regression risk:** Medium-low — the dialog is used from two places (PIP Management, Monthly Trend report). Both call sites get updated; the shared form body is extracted, not rewritten.
- **Scalability:** KPI lookup is scoped to one employee × window (tens of rows); a hard `limit` is still applied.
- **Rollback:** Route addition is additive; the dialog wrapper can be re-enabled by reverting two call sites. Policy revert = restore previous text.

## Plan

### 1. Full-page create route
- Extract the current form body into `src/components/pip/PIPCreateForm.tsx` (unchanged validation, guardrails, submit logic).
- New page `src/pages/admin/PIPCreate.tsx` at route `/admin/pip/new`, registered in `App.tsx` under the same admin guard as `/admin/pip`.
  - `PageHeader` with title, description, `backTo="/admin/pip"`.
  - Two-column layout ≥`lg` (left: employee, dates, reason, areas; right: success criteria, support, milestones), single column on mobile. `max-w-7xl`, sticky bottom action bar with Cancel / Create.
- Prefill via query params: `?employee=<id>&trigger=<source>` plus trigger context passed through router `state` (falls back to re-deriving the reason from the candidate row when state is absent).
- `PIPCreateDialog` becomes a thin wrapper / is removed once both call sites — `PIPManagement.tsx` and `MonthlyTrendView.tsx` — navigate to the route.
- **Verification:** `/admin/pip/new` loads standalone, browser back returns to the list, create still succeeds.

### 2. Areas of Improvement — low-scoring KPI picker
- New hook `src/hooks/useLowScoringKpis.ts`: given `employeeId` + window months + threshold, fetch `kpis(id, kra_name, kpi_name, review_period, review_year)` joined to `review_submissions(final_score)` for those periods, keep rows where `final_score` is non-null and **below the PIP threshold**, exclude N/A rows, sort ascending by score.
- New component `src/components/pip/LowScoringKpiPicker.tsx`: checkbox list grouped by KRA, each row showing `KPI name` + `Month · score` badge only (no formula, no scoring logic, no target). Empty state, skeleton while loading, disabled with a hint until an employee is selected.
- Selections merge into `improvement_areas` alongside the existing generic chips (both kept). Zod rule unchanged: at least one area total.
- Stored form of a KPI area: `"KRA — KPI (Mon YYYY)"`, so PIP detail/reports render it without extra joins.
- **Verification:** unit tests for the filter/threshold/grouping helper in `src/test/pip/lowScoringKpis.test.ts`.

### 3. PMS Policy document update
- Update the stored PMS Policy (`app_settings.pms_policy_content`) to include the full **§15 Performance Improvement Plan** section from the ADR-205/207 draft: triggers (§15.2 monthly, §15.3 annual), initiation and RM2 sign-off (§15.5), support & resources (§15.6), duration/cadence and no-overlap (§15.7), employee acknowledgement (§15.9), outcomes, and the 3-month sustain window (§15.12) — noting all numeric bounds are admin-configurable.
- Mirror the same section into `POLICY.md`, add a `DOCUMENTATION.md` version-history entry, and write ADR-208 covering items 1, 2 and 4.

### 4. "Initiate PIP" must preselect the employee
- **Root cause (confirmed in `PIPCreateDialog.tsx` line 233):** the employee `Select` is bound with `defaultValue={field.value}` instead of `value={field.value}`. The dialog mounts once with an empty default, so the later `form.setValue('employee_id', …)` updates form state but the trigger keeps rendering the placeholder — exactly the blank field in your screenshot.
- Fix: controlled `value={field.value}` in the extracted form; on the new route the employee also arrives via the URL param, so the value is correct on first render. When arriving from a suggestion the field is shown read-only with a "Change employee" affordance so the trigger context stays consistent with the chosen person.
- **Verification:** regression test asserting the form renders the preselected employee's name, plus a manual pass from Suggestions → Initiate PIP.

## Technical notes

- Score source stays `review_submissions.final_score` (universal scoring SSOT) — the picker never recomputes.
- Threshold read from the existing `getPipThreshold()` setting; no hardcoded 2.00.
- Window months reuse `trailingWindow()` / `buildMonthRange()` from `usePIPCandidates` so the picker and the suggestion row can never diverge.
- Tests: existing 45 PIP tests must stay green; new tests added for the KPI helper and prefill.
