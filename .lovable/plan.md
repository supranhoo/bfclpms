## Problem

When an assisted-review page is switched to Hindi (or Spanish), several UI strings remain in English:

- "← Back to queue" (page header)
- "Assisted self-review mode" banner and its body copy
- "Submitted with assistance" badge
- "Contributes X / Y points to your appraisal" (System Score cards)
- Eligibility table headers: "Criterion", "Policy Description", "Actual"
- Eligibility remark label: "Remark from HR"
- Carry-KRA labels: "Achieved", "Out of", "Rating"
- Carry-KRA table headers: "Total Score", "Out Of", "%", "Rating (/5)"
- Carry-KRA helper line ("Employee context unavailable…")
- No-criteria placeholder in stage card

Two independent causes:

1. **Hardcoded English strings** in `TeamAnnualReviewDetail.tsx` and `TeamReviewDetailContent.tsx` — they never route through the translator.
2. **Missing keys in the Hindi/Spanish UI dictionary** (`src/lib/annualReview/i18n.ts`). Components already call `t('system_scores.contribution', …)`, `t('eligibility.col.criterion', …)`, `t('carry.achieved', …)`, etc., but those keys don't exist under `hi` / `es`, so the resolver returns the English fallback.

Template-authored content (KPI names, scoring notes, criterion names/descriptions coming from `system_score`/`eligibility` template records) is out of scope — those are populated per-template via HR-authored `templateTranslations` and require content work, not a code fix. This plan will call that out but not change data.

## Fix (surgical, UI/i18n only)

### 1. Extend `src/lib/annualReview/i18n.ts` (Hindi + Spanish)

Add the missing keys already referenced in code:

- `nav.back_to_queue`
- `assisted.mode_title`, `assisted.mode_body` (uses `{name}` placeholder)
- `badge.submitted_with_assistance`
- `system_scores.contribution` (uses `{actual}` / `{max}` placeholders)
- `eligibility.col.criterion`, `eligibility.col.policy_description`, `eligibility.col.actual`
- `eligibility.remark_label`
- `carry.achieved`, `carry.out_of`, `carry.rating`
- `col.total_score`, `col.out_of`, `col.percent`, `col.rating_5`
- `carry.employee_context_missing`
- `stage.no_criteria` (uses `{stage}` placeholder)

### 2. Route hardcoded strings through `t()`

- `src/pages/annual-review/TeamAnnualReviewDetail.tsx` — wrap "Back to queue" in `t('nav.back_to_queue', 'Back to queue')`. Needs `useAnnualReviewI18n` (already provided by the outer `AnnualReviewI18nProvider`).
- `src/components/annual-review/TeamReviewDetailContent.tsx`:
  - Assisted-review banner title + body via `t()` with a `{name}` placeholder replaced in JSX.
  - "Submitted with assistance" badge via `t()`.
  - "No criteria to score for the {stage} stage…" via `t()`.
- `src/components/annual-review/SystemScoresPanel.tsx` — the `t()` calls are already in place; adding dictionary entries (step 1) is what activates them. Also add the missing Carry-KRA helper text `t()` wrap.

No template-schema changes, no DB migration, no policy change.

## Verification

1. Build/typecheck.
2. Load the assisted-review page from the screenshot in Hindi — confirm all listed strings render in Devanagari.
3. Switch to Spanish — parity check.
4. Switch back to English — strings unchanged (no double-translation).
5. Existing unit tests under `src/test/annualReview/` still pass; add a small test asserting that every new dictionary key exists for both `hi` and `es`.

## Risk & impact

- **Data:** none.
- **Workflow / policy:** none.
- **UI/UX:** only rendered text changes for `hi`/`es`. English is untouched (fallback path returns English when `current === default`).
- **Regression:** low. All changes are additive dictionary entries + `t()` wrappers around existing literals.
- **Scalability:** none (static dictionary; no query impact).
- **Rollback:** trivial (revert file edits).

## Docs

Add a short bullet to `src/modules/annual-review/POLICY.md` (i18n section) noting the fixed keys and reminding template authors that KPI names and scoring notes are template-authored translations, not UI-dictionary translations.
