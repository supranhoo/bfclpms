## What's actually broken

The editor shows the generic English ladder ("Outstanding / Above target / …") for a specific set of criteria because those rows were saved to `annual_review_criteria_library` with an empty `scoring_bands` JSON. When bands are empty, `CriteriaLibraryPanel` falls back to `defaultLadder(maxScore)` — which is exactly the "0-5 default" you're seeing. Nothing is wrong with the reader.

DB confirms it. Out of 26 criteria:
- **20 rows are correct** — 6 bilingual bands each, full EN + HI labels (Attendance, PPE, Teamwork, 5S Housekeeping, etc.). These came from `BFCL_Annual_Review_All_Forms` via the `parseBfclFormsWorkbook` importer.
- **9 rows are polluted** with `bands_len = 0`:
  - System KPIs mis-imported as criteria: `5s`, `lti_lost_time_injury_rate`, `sti_short_time_injury_rate`, `ua_uc_nm_reported_by_self`, `training_attended`, `fugitive_pm10`
  - Self-review free-text prompts mis-imported as criteria: `do_you_need_any_new_tools…`, `how_can_we_make_our_shop_floor…`, `what_new_skill_or_machine…`
  - One bogus row `criteria` (parsed header)

### Root cause (single bug, two symptoms)

`CriteriaLibraryImportDialog` uses `parseCriteriaPackWorkbook` (in `src/lib/annualReview/criteriaWorkbook.ts`), which is **section-blind**. It anchors on the first row containing a "Criteria" cell and then imports every following row as a criterion — including the `Eligibility`, `System`, and `Self Review Fields` blocks. For those rows the rating description isn't the `"5 - EN / HI\n4 - …"` bilingual ladder (it's things like `"Any departmental LTI in AY 25-26 (5=0, 4=1, …)"`), so `parseBandsBlock` returns `[]`, `scoring_bands` is written as `[]`, and the editor renders the default ladder.

We already have a correct parser — `parseBfclFormsWorkbook` — that separates `Eligibility` / `System` / `Type` blocks and only routes real criteria rows into the library. The generic BFCL workbook has the same three-section shape, so the same parser handles it.

## Fix (tight scope, no template rework)

Two surgical changes + one cleanup migration. No changes to templates, assignments, mapping, or the reviewer form path.

### 1. Section-aware import (frontend)

`src/lib/annualReview/criteriaWorkbook.ts` → `parseCriteriaPackWorkbook`:
- Track a section marker on column A (`Eligibility` / `System` / `Type`). Only rows in the `Type` block are criteria.
- Additionally skip any row whose column-A block label is `Self Review Fields` (those go elsewhere, not into the criteria library).
- Skip rows whose "rating description" cell doesn't contain a `^\d+\s*[-–]\s*` line (guarantees we never write a criterion with an unparseable ladder — such rows are surfaced as a warning instead of silently defaulted).

### 2. Import dialog: stop silently defaulting

`src/components/annual-review/CriteriaLibraryImportDialog.tsx`:
- If `parseBandsBlock(row.rating_desc)` returns `[]`, do NOT upsert the criterion. Collect these into a warnings list shown in the dialog footer (`Skipped N rows without a bilingual rating ladder — please review the workbook`).
- Unchanged: rows with a real ladder continue to write `scoring_bands` via `optionsToBands(parsed)`, exactly as today.

### 3. One-time DB cleanup migration

Delete the 9 polluted library rows AND their assignments so tomorrow's launch reads only clean data:

```
DELETE FROM annual_review_criteria_assignments
 WHERE criterion_id IN (
   SELECT id FROM annual_review_criteria_library
    WHERE key IN ('5s','lti_lost_time_injury_rate','sti_short_time_injury_rate',
                  'ua_uc_nm_reported_by_self','training_attended','fugitive_pm10',
                  'do_you_need_any_new_tools_safety_gear_or_training_to_do_your',
                  'how_can_we_make_our_shop_floor_safer_and_better',
                  'what_new_skill_or_machine_do_you_want_to_learn_next_year',
                  'criteria')
      AND coalesce(jsonb_array_length(scoring_bands), 0) = 0
 );
DELETE FROM annual_review_criteria_library
 WHERE key IN (...same list...)
   AND coalesce(jsonb_array_length(scoring_bands), 0) = 0;
```

Guard rails: the `WHERE coalesce(jsonb_array_length(scoring_bands),0) = 0` clause guarantees we never touch a row that has real bilingual bands, so this is safe to re-run and can't wipe legitimate data.

System KPIs (`LTI Rate`, `STI Rate`, `5S`, `Training attended`, `UA UC NM`, `Fugitive PM10`) already exist correctly in `annual_review_system_kpis` (8 rows verified last turn) — they belong there, not in the criteria library.

### 4. Test coverage

- `src/lib/annualReview/criteriaWorkbook.test.ts` (new): given the actual BFCL Generic workbook layout, only the 5 Type-block rows are returned; System, Eligibility, Self Review rows are excluded.
- `src/lib/annualReview/bfclFormsWorkbook.test.ts` already covers `parseBandsBlock` bilingual splits — no change needed.

## Why not "go back to manual templates"

The template feature isn't the problem. The template/assignment path is producing correct forms for 20/26 criteria today (verified: bilingual EN+HI bands, 6 rating labels each). Only the import path let 9 junk rows through. A 2-file frontend patch + a one-line safety-guarded migration removes the visible symptom in one iteration — cheaper and safer than reverting to manual template management for tomorrow's launch.

## Rollback

- Frontend: revert the two files.
- DB: the cleanup only deletes rows with `scoring_bands = []`, so restoring them would just mean re-running the (fixed) importer against the source workbook.

## Not applicable

Docs/policy updates: this is a bug fix, not a policy change. No RLS, workflow, or scoring-engine changes.

Confirm and I'll ship all three (frontend patch, migration, test) in one turn so it's live tonight.