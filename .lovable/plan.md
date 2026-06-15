# Carry KRA — Fix Data Fetch + Show Out-of / Achieved / Rating-out-of-5

## Assumptions
- The screenshot shows Carry KRA = **0.00** with all 12 months at `KPIs=0` for FY2026, even though the user is an active employee.
- The cycle in the DB is `Annual Review - 2025-2026`, `review_year = 2026`. By BFCL convention (memory: *fiscal cycle is July–June*) this label means **fiscal year ending June 2026**, i.e. fyStart = 2025 → covers Jul 2025 → Jun 2026.
- DB confirms the data lives there: `kpis.review_year` has 2900 rows for 2025 (Jul–Dec 2025) and 11854 rows for 2026 (Jan–Jun 2026).
- KPI scores in `review_submissions` are on a **0–5 scale** (confirmed: max=5, avg≈3.44 across 10,933 rows with at least one of final/auditor/manager/self set).

## Risk & Impact Report — TWO real bugs + one UX gap

### Bug 1 — Fiscal year off-by-one (root cause of all 0s)
- **Where:** `src/pages/annual-review/EmployeeAnnualReview.tsx:161` passes `fiscalYear={cycle.review_year}` (=2026) straight to `SystemScoresPanel`, which forwards it as `fyStart` to `buildCarrySnapshot`.
- **What goes wrong:** `buildCarrySnapshot` treats `fyStart=2026` as **July 2026 → June 2027**. No such data exists → every month bucket = 0 KPIs → carry value = 0.
- **Fix:** Introduce a single SSOT helper `fyStartFromCycle(cycle)` in `src/lib/annualReview/fiscalYear.ts` that returns `cycle.review_year - 1`. Use it in `EmployeeAnnualReview.tsx` and anywhere else the cycle drives a fyStart. Add a unit test that locks the convention.
- **Data Impact:** None (read-only fetch fix). No schema changes.
- **Regression Risk:** Low — narrows the existing `fyStart` path; the manager / skip / BU / HR / report screens that already render system scores will start showing the correct historical data instead of 0.

### Bug 2 — Scale mismatch (carry contribution silently 20× too small)
- **What goes wrong:** KPI scores are 0–5, so `aggregateMonthly` produces monthly avgs in 0–5 and `computeCarryValue` averages them → carry value is 0–5. That 0–5 number is then fed straight into `system_scores[<id>]` as if it were already in percentage points (the contract per `mem://features/annual-review/overview.md`: *system scores are stored already-weighted, i.e. in percentage points*). A Carry KRA scored 100% with weight=100 would only contribute **5** to a /100 appraisal instead of **100**.
- **Fix:** In `carryKraScore.ts`, change the contract so `computeCarryValue` accepts the score's `weight` and the `KPI_SCALE_MAX = 5` constant, and returns the **scaled contribution**: `(avg_of_monthly_avgs / 5) * weight`. Expose the unscaled `rating` (0–5) in the snapshot alongside `value` (scaled contribution) and `maxValue` (= weight). Update existing callers and tests.
- **Documentation:** Update POLICY.md — the rule "system scores are already-weighted percentage points" still holds; `computeCarryValue` becomes responsible for that scaling (it was the only source feeding raw 0–5 into the totals).
- **Regression Risk:** Medium — this changes what is persisted in `annual_review_instances.system_scores[<id>]`. We do NOT mutate any existing rows; the on-mount sync in `CarryKraScoreCard` will re-write the correct value the next time a reviewer opens the form (idempotent overwrite — this is the existing behavior). No migration. We will add a snapshot test pinning the old vs. new math so the change is loud, not silent.

### UX request — show three numbers explicitly
- **Where:** `SystemScoresPanel.CarryKraScoreCard` (employee/reviewer form) and the rightmost summary of `CarryKraMappingPreview` (admin template editor).
- **What changes:** Replace the single bold number with three labeled metrics in one row:
  - **Achieved:** `value.toFixed(2)` (scaled contribution, 0–weight)
  - **Out of:** `weight` (max contribution from this system score)
  - **Rating:** `rating.toFixed(2)` **/ 5** (raw average across selected months)
- Add a column **Rating (/5)** in the monthly breakdown so each month's number is unambiguously on the 0–5 scale (the existing "Avg Score" column header is silent about scale, which is part of why this confused the user).
- Tooltip on **Achieved**: *"Average rating × max weight ÷ 5"*. Tooltip on **Rating**: *"Weighted average of monthly KPI ratings (final → auditor → manager → self), excluding N/A"*.
- Progress bar drives off `(value / weight) * 100` so it actually reflects achievement.
- No design tokens added — reuses existing `text-muted-foreground`, `text-foreground`, `tabular-nums`, `Badge` styles.

### Scalability
Not Applicable — same query, same row count.

### Mitigation
- One SSOT for fiscal-year derivation prevents the same off-by-one re-appearing on reviewer / HR / report surfaces.
- One SSOT for the score scaling (only inside `computeCarryValue`).
- Unit tests pin both the fiscal mapping and the scaling math.

## Step-by-step Plan
1. **New SSOT helper** — `src/lib/annualReview/fiscalYear.ts` exporting `KPI_SCALE_MAX = 5` and `fyStartFromCycle(cycle: Pick<AnnualReviewCycle, 'review_year'>): number` returning `cycle.review_year - 1`. Unit test asserts the FY 2025-26 cycle (review_year=2026) → fyStart=2025.
2. **Update `EmployeeAnnualReview.tsx`** — replace `fiscalYear={cycle.review_year}` with `fiscalYear={fyStartFromCycle(cycle)}`. Verify by browsing `/annual-review` after the fix — monthly grid should populate.
3. **Audit other reviewer surfaces** that render `SystemScoresPanel` (manager, skip, BU, HR, report, KPI journey) — make sure each uses `fyStartFromCycle(cycle)` (or already does). No silent fallbacks to `cycle.review_year`.
4. **`src/services/annualReview/carryKraScore.ts`** — extend `CarryKraSnapshot`:
   - Keep `monthly` (each month is the unscaled 0–5 rating).
   - Add `rating: number` (0–5, average of selected monthly ratings).
   - Change `value` to `(rating / KPI_SCALE_MAX) * weight` (the percentage-point contribution).
   - Add `maxValue: number = weight`.
   - `buildCarrySnapshot` signature gains `weight: number` (already known by callers since the system_score row carries it).
5. **Update `SystemScoresPanel.CarryKraScoreCard`** — pass `score.weight`, render Achieved / Out of / Rating, fix the Progress bar formula, add the Rating(/5) column, keep the on-mount idempotent write of `value` into `instance.system_scores`.
6. **Update `CarryKraMappingPreview`** — same three-number summary header; same column rename; pick a sensible default `weight` for the preview (use the score's `weight` if mounted under a row, else default to 100 and label it "preview weight").
7. **Tests** —
   - `fiscalYear.test.ts` (new): review_year → fyStart mapping.
   - `carryKraScore.test.ts` (extend): same mock rows now produce `rating ≈ 3.44` and `value = rating/5 * weight`. Snapshot the diff so any future regression is loud.
   - `templateEditorCarryKraShortcut.test.tsx` (existing) — keep passing.
   - Add `systemScoresPanel.carry.test.tsx`: renders the three numbers with mocked snapshot.
8. **Docs**
   - `src/modules/annual-review/DOCUMENTATION.md`: add a version-history entry explaining (a) the FY mapping SSOT, (b) the carry-value contract change, (c) the three-number card UI.
   - `src/modules/annual-review/POLICY.md`: clarify "system_scores values are percentage-point contributions; carry_kra scaling happens inside `computeCarryValue`".
   - `mem/features/annual-review/carry-kra-score.md`: replace the line about "average of monthly avgs" with the scaled contract + the FY mapping rule.

## UI Changes
- **Where:** Carry KRA card in `SystemScoresPanel` (every reviewer stage of `/annual-review*`) and the preview header in the Template Editor.
- **What changes visually:**
  - Single "0.00" replaced with `Achieved 68.83 · Out of 100 · Rating 3.44 / 5`.
  - Monthly breakdown table column header changes `Avg Score` → `Rating (/5)`.
  - Progress bar fills based on `(achieved / weight) * 100`.
- **Interaction impact:** None — still read-only for employees; reviewer scoring entry is untouched. The on-mount `onChangeValue` re-sync now writes the **corrected** value into the instance.
- **Responsiveness:** Three metrics laid out as `flex flex-wrap gap-x-4 gap-y-1` so they stack cleanly on mobile.

## Tests
See Step 7.

## Documentation Updates
See Step 8.

## Post-implementation Notes
- One follow-up worth flagging (NOT in this change): old `annual_review_instances.system_scores` rows persisted before the fix still carry the 0–5 mini-values. They'll auto-correct the next time anyone opens the review (the idempotent sync), but if any cycle was already closed with carry_kra those final totals are wrong by 20×. If that has happened in production, a one-shot recompute script would be needed — I'll flag it after we ship the fix and check `system_scores` payloads in `annual_review_instances` for any closed cycle.
- We are explicitly NOT changing `pickScore`'s cascade (final → auditor → manager → self) per your "approved final data" requirement — that cascade *is* "approved final wherever available, fall back when not approved yet", which is the existing universal scoring SSOT.
