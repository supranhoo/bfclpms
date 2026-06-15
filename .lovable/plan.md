# Plan — Carry KRA "Data Map" preview inside the Template Editor

## What's being added
A live preview inside the Template Editor that lets an admin pick any active employee + fiscal year and instantly see the month-wise KRA data that the Carry KRA system score would currently pull. No new business logic, no schema change — purely a verification surface that reuses the existing `buildCarrySnapshot` service.

Today the editor only shows the config knobs (aggregation / N / selected months / exclude N/A). After this change the same panel also shows: which months have data, KPI count per month, monthly avg, which months will be "Used" under the current config, and the resulting carry value. Admins can confirm the mapping is sane before they publish the template.

## Risk & Impact

- **Data impact:** none — read-only. Same service the employee form already uses.
- **Workflow impact:** none. Preview is editor-only.
- **UI impact:** the Carry KRA config card grows a new collapsible "Preview employee mapping" section (default collapsed so the table doesn't bloat the editor). Inline in the System Scores row, as confirmed.
- **Performance:** one Supabase query per (employee, fyStart) selection, gated behind `enabled`. `react-query` cache (60s) prevents repeats. Employee picker uses the existing `profiles` search pattern with a 50-row cap and `is_active = true` filter.
- **Regression risk:** Low — new sub-component, no edits to existing carry math.
- **Mitigation:** Reuses `buildCarrySnapshot` (already unit-tested). New picker has a render test + an "empty selection" test.

## Implementation

### 1. Service (no DB change)
Add a thin `searchActiveEmployees(query, limit=20)` helper in `src/services/annualReview/annualReviewService.ts` if not already present — filters `profiles` by `is_active = true` and `full_name ilike %q%` / `employee_code ilike %q%`, ordered by name, capped at 20.

### 2. New component
`src/components/annual-review/CarryKraMappingPreview.tsx`
- Props: `cfg: CarryKraConfig`
- Internal state: `employeeId`, `fyStart` (defaults to current fiscal year — July rule).
- Uses `useQuery(['carryKraPreview', employeeId, fyStart, cfg], () => buildCarrySnapshot(...))` enabled only when both are set.
- Renders:
  - A `Combobox`-style employee search (debounced 250ms) showing `Full Name · Code · Designation`.
  - A fiscal year selector (current FY ± 2 years).
  - A summary row: "Carry value: **X.XX** · N of 12 months with data · aggregation: `<label>`".
  - The same Jul→Jun table used in `SystemScoresPanel.CarryKraScoreCard` (Month / KPIs / Avg Score / Used) so admins see exactly what the employee will see.
  - Empty / loading / error states.

### 3. Wire into the editor
In `TemplateEditorDialog.tsx → CarryKraConfigEditor`, append `<CarryKraMappingPreview cfg={cfg} />` inside a shadcn `Collapsible` with trigger label "Preview employee mapping". Stays collapsed by default to keep the editor compact. No prop drilling — the preview reads `cfg` only, so changes to the config rerun the query.

### 4. Tests
- `CarryKraMappingPreview.test.tsx`: mocks `buildCarrySnapshot` + `searchActiveEmployees`; asserts (a) the query is not fired without an employee, (b) the table renders 12 rows including null months, (c) the "Used" column matches `selectMonths(cfg)`.
- Extend `carryKraScore.test.ts` only if a new pure helper lands (none planned).

### 5. Docs & policy
- `src/modules/annual-review/DOCUMENTATION.md`: add a "Template Editor — Carry KRA mapping preview" subsection describing the picker, defaults, and that it is read-only.
- `src/modules/annual-review/POLICY.md`: one-line rule — "Any Carry KRA source MUST be previewable from the Template Editor before publish; the preview is read-only and must reuse `buildCarrySnapshot`."
- `mem/features/annual-review/carry-kra-score.md`: append "Template Editor exposes an inline employee mapping preview using the same `buildCarrySnapshot` snapshot — single source of truth."

## Out of scope
- Bulk cohort coverage (e.g. "82/120 employees have ≥6 months") — explicitly deferred per the clarifying answer.
- Editing historical PMS data from inside the preview.
- Saving the previewed snapshot to the instance (admins still rely on the per-instance auto-fetch at review time).

## Rollback
Pure additive: remove the `<CarryKraMappingPreview>` mount and delete the new file. No schema, no migration, no behaviour change to existing reviews.
