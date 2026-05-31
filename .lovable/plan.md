## Goal
Ensure every Assessment Year dropdown defaults to the **current AY (Jul–Jun fiscal cycle)** — not to the latest seeded year. Today (May 2026) the default must be **2025-26** everywhere.

## Root Cause
1. `generateAssessmentYears()` in `src/hooks/useIncrementEligibility.ts` uses an **Apr–Mar** cycle (`month >= 3`), conflicting with the project's canonical **Jul–Jun** fiscal cycle (per memory + `KpiWeightageDashboard` + `buildAYOptions` in increment pages).
2. Sections (`IncrementEligibilitySection`, `IncrementMethodSection`, `AnnualScoreCalculationSection`) compute `years = [...knownYears, ...seeded].sort().reverse()` and default the dropdown to `years[0]`, i.e. the **newest seeded year** (currently 2030-31), not the current AY.
3. `ExclusionsCard` defaults to `defaultAssessmentYear` passed by parent (fine once parent is fixed).
4. Three duplicate `buildAYOptions()` copies exist (`GeneralEligibility.tsx`, `IncrementSlabs.tsx`, `IncrementInputs.tsx`) — Jul–Jun based, default to `ayOptions[1]` (current). Correct logic but duplicated.

## Fix Strategy (frontend only, no schema change)

1. **New canonical util** `src/lib/assessmentYear.ts`:
   - `getCurrentAssessmentYearStart(d = new Date())` → number (e.g. 2025)
   - `formatAssessmentYear(startYear)` → `"2025-26"`
   - `getCurrentAssessmentYear()` → `"2025-26"`
   - `generateAssessmentYears(spread = 4)` → rolling list centered on current, **newest first**, Jul–Jun based
   - Unit tests covering month 6 (Jun → previous AY) vs month 7 (Jul → new AY) boundary and leap-year edge.

2. **Update `useIncrementEligibility.ts`**: re-export `generateAssessmentYears` from the new util to keep imports stable; delete the Apr–Mar version.

3. **Update the three sections** so the initial state uses `getCurrentAssessmentYear()` instead of `years[0]`. Also fix the post-reset assignment (line 112 in IncrementEligibilitySection).

4. **Consolidate `buildAYOptions`** in the three increment pages — replace each local copy with `generateAssessmentYears(2)` from the util and default `useState` to `getCurrentAssessmentYear()` rather than `ayOptions[1]`.

5. **Audit other AY/fiscal dropdowns**: `KpiWeightageDashboard` already aligns to Jul–Jun; no change. Grep for any other `getMonth() >= 3` or `>= 6` patterns to be sure none remain misaligned.

## UI Impact
- Same dropdown contents (slightly different range — still ±4 years around current). The **selected value on first load is now the current AY** (today: `2025-26`).
- No layout or component changes.

## Tests
- `src/lib/assessmentYear.test.ts` — boundary cases for `getCurrentAssessmentYear` and `generateAssessmentYears` ordering.

## Risk & Impact
- **Data**: None — pure frontend default change.
- **Workflow**: Users land on the relevant year by default instead of an empty future year (positive UX).
- **Regression**: Low; behind a single helper now used everywhere. Existing values already in DB remain selectable via the dropdown.

## Not Applicable
- DB / RLS / migration changes.
- Backup or audit changes.