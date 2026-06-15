## Goal
Make the Monthly KRA Breakdown table inside the Carry KRA card more informative by adding **Total Score**, **Out Of**, and **%** columns alongside the existing **Rating (/5)** column.

## What changes visually
Inside `SystemScoresPanel` → `CarryKraScoreCard` → collapsible "Monthly KRA breakdown" table.

Before (today):
```text
Month | KPIs | Rating (/5) | Used
```

After:
```text
Month | KPIs | Total Score | Out Of | %    | Rating (/5) | Used
July  |  0   |     —       |   —    |  —   |     —       |
Jan   | 10   |   49.70     |  50    | 99.4 |    4.97     | ✓
```

- **Total Score** = sum of (kpi_score × kpi_weight) for that month, on the 0–5 scale (the weighted numerator we already compute).
- **Out Of** = sum of kpi_weight × 5 (perfect month → 100%, independent of KPI count).
- **%** = Total Score ÷ Out Of × 100 (equivalent to `avg / 5 × 100`).
- **Rating (/5)** column stays exactly as today (preserves existing meaning + tests + i18n key).
- Empty months keep an em-dash in all numeric cells.
- The Carry KRA header summary (Achieved / Out of / Rating) and progress bar are unchanged.
- Mobile: table already scrolls horizontally inside the collapsible; no layout regression expected.

## Technical details

1. **`src/types/annualReview.ts`** — extend `CarryKraMonthly` with three additive optional fields:
   - `totalScore: number | null` (weighted sum, 0–5 scale)
   - `outOf: number | null` (sum of weights × 5)
   - `percentage: number | null` (0–100)
   No breaking change — existing consumers ignore them.

2. **`src/services/annualReview/carryKraScore.ts`** — `aggregateMonthly` already tracks `weighted` and `weight` internally. Surface them as `totalScore = weighted`, `outOf = weight × KPI_SCALE_MAX`, `percentage = (avg / KPI_SCALE_MAX) × 100`. Null months → null/null/null. No change to `computeCarryRating` / `computeCarryContribution` / `buildCarrySnapshot`.

3. **`src/components/annual-review/SystemScoresPanel.tsx`** — insert `Total Score`, `Out Of`, `%` columns BEFORE the existing `Rating (/5)` column. New translation keys: `col.total_score`, `col.out_of`, `col.percent` (defaults: "Total Score", "Out Of", "%"). Existing `col.rating_5` stays.

4. **Tests**
   - Extend `src/services/annualReview/carryKraScore.test.ts`: weights 10 + 30, scores 4 + 3 ⇒ `totalScore = 130`, `outOf = 200`, `percentage = 65`, plus null-month case.
   - Extend `src/test/annualReview/systemScoresPanelCarry.test.tsx`: assert the four headers render (Total Score, Out Of, %, Rating (/5)) and a populated row shows formatted values.

5. **Docs / Policy**
   - `mem/features/annual-review/carry-kra-score.md` — note the additive monthly fields and the four breakdown columns.
   - `src/modules/annual-review/DOCUMENTATION.md` — update the Carry KRA section's table description.
   - `src/modules/annual-review/POLICY.md` — one-line note: monthly Total / Out Of / % are display-only transparency aids and are NOT used in appraisal totals.

## Risk & Impact
- **Data**: none — purely derived display fields; no schema change, no migration.
- **Workflow**: none.
- **UI**: one table grows from 4 → 7 columns inside an already-collapsible section.
- **Regression**: very low — header summary, scoring, and snapshot persistence are untouched. Covered by new + existing tests.
- **Rollback**: revert the four files; no data cleanup needed.

## Out of scope
- Header summary, progress bar, scoring math, `system_scores[<id>]` persisted value.
- `CarryKraMappingPreview` (admin template editor) — if you want the same columns there, say so and I'll mirror it; otherwise it stays as-is for now.
