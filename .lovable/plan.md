# Plan — Fix Annual Review language switcher

## Root cause

The language dropdown writes to local `lang` state correctly, but almost nothing on the page reads through the `t(...)` translator:

1. **Hardcoded English in the page shell** (`EmployeeAnnualReview.tsx`)
   - "Self-Assessment Criteria", "Qualitative Responses", "Submit your self-review?", confirm-dialog body, "Could not save…", etc. are string literals, not `t()` calls.
2. **Child components don't receive a translator**
   - `AnnualReviewStageTracker` renders "Self Review / Manager / Skip Manager / BU Head / HR Final" as hardcoded English.
   - `AnnualReviewStatusBadge` ("Self Review Pending" in the screenshot) is hardcoded.
   - `SystemScoresPanel` — "System Scores", "No system scores configured…", "Eligibility criteria not met", "Monthly KRA breakdown", carry-config chips.
   - `CriteriaScoringMatrix` — column labels WEIGHT / SCORE / TOTAL, "Remarks / justification" placeholder, reviewer label, evidence button.
   - `LanguageSwitcher` itself uses the static `SUPPORTED_LANGUAGES` labels (fine, those are already in the target language).
3. **Template-authored content is not translated**
   - Criterion `name`/`description`, system-score `name`, self-review field `label`/`placeholder`, eligibility-criterion `name`.
   - The i18n resolver already supports `template.translations[lang][key]` — we just never look up keys like `criterion.<id>.name`.

The dictionary in `src/lib/annualReview/i18n.ts` already contains Hindi/Spanish entries for `stage.*`, `status.*`, `col.*`, `btn.*`, `note.*`, `warn.ineligible`. The static fallback is in place; the UI just isn't calling `t()`.

## Secondary bug (runtime error on this page)

`EmployeeAnnualReview.tsx` calls `useMemo` at line 65, then issues conditional `return`s at lines 70–78, then calls another `useMemo` at line 114 — so the hook count changes between renders ("Rendered more hooks than during the previous render"). Must be fixed in the same edit, otherwise any change on this page risks re-triggering it.

## Risk & Impact

- **Data impact:** none. Pure i18n / render layer.
- **Workflow impact:** none. No RPCs touched, no policy/schema changes.
- **UI/UX impact:** Hindi/Spanish users finally see translated labels on Employee, Team, and HR finalization views. English experience is unchanged (precedence rule: `current === default → fallback`).
- **Regression risk:** Low. Translator already exists; we only widen its usage. Layout unchanged.
- **Mitigation:** Snapshot/render tests asserting Hindi strings appear when `lang='hi'` and English when `lang='en'`. Fixing the hook order is a structural correction with an added test.

## Implementation plan

### 1. Fix hooks-order bug
In `src/pages/annual-review/EmployeeAnnualReview.tsx`, move all `useMemo` / derived-state hooks above the `if (cycleLoading) … if (!cycle) … if (!instance) …` early returns. Guard the memo bodies with optional chaining so they're safe to run with `instance == null`.

### 2. Centralise the translator context
Build a tiny `AnnualReviewI18nContext` (provider + `useAnnualReviewI18n()` hook) so child components don't need each parent to pass `t` through props.

- Provider lives at the top of `EmployeeAnnualReview`, `TeamAnnualReview`, and `HrFinalizationSheet`.
- Value: `{ t, currentLanguage, defaultLanguage, templateTranslations }`.

### 3. Extend the static dictionary (`src/lib/annualReview/i18n.ts`)
Add missing keys for both `hi` and `es`:
- `section.system_scores`, `section.self_assessment`, `section.qualitative`, `section.monthly_kra_breakdown`
- `system_scores.empty`, `eligibility.title`
- `col.weight_long`, `col.score_long`, `col.total_long`, `col.remarks_placeholder`, `col.evidence`
- `confirm.submit.title`, `confirm.submit.body`, `btn.cancel`
- `note.save_error`
- `cycle.my_review_by` (used in the header subtitle)

### 4. Wire `t()` into components
- `AnnualReviewStageTracker` — replace literal stage labels with `t('stage.<role>', '<English>')`.
- `AnnualReviewStatusBadge` — map status → `t('status.<status>', '<English>')`.
- `SystemScoresPanel` — translate title, empty state, eligibility alert title, monthly-breakdown headers.
- `CriteriaScoringMatrix` — translate column chip labels and remarks placeholder; allow `reviewerLabel` to be a translation key.
- `EmployeeAnnualReview` page shell — translate card titles, footer messages, confirm dialog, header subtitle.

### 5. Translate template-authored content
Helper `tTemplate(kind, id, field, fallback)` that looks up `template.translations[lang]["<kind>.<id>.<field>"]` (e.g. `criterion.attendance.name`) and falls back to the English value from `template.sections`. Use it for:
- `TemplateCriterion.name` / `description`
- `TemplateSystemScore.name`
- `SelfReviewField.label` / `placeholder`
- `EligibilityCriterion.name`

This unlocks per-template translations that admins author in the Template Editor without further code changes.

### 6. Mirror the same wiring on Team & HR views
`TeamAnnualReview.tsx` and `HrFinalizationSheet.tsx` already render `CriteriaScoringMatrix` / `SystemScoresPanel`; once those children use the context, both views translate automatically. Add the provider + a `LanguageSwitcher` to each (Team reads `instance.language_pref`).

### 7. Tests (Vitest + Testing Library)
- `i18n.test.ts` (extend existing) — assert the new keys resolve in `hi` and `es`.
- `AnnualReviewStageTracker.i18n.test.tsx` — render under the provider with `hi`, expect "स्व मूल्यांकन".
- `AnnualReviewStatusBadge.i18n.test.tsx` — `hi` + `pending_self` → "स्व मूल्यांकन लंबित".
- `EmployeeAnnualReview.hooks.test.tsx` — render with `instance` toggling from `null` to a mock; no React warning, no error thrown (regression guard for the hook-order fix).
- `CriteriaScoringMatrix.i18n.test.tsx` — column chips and remarks placeholder translate.

### 8. Documentation & policy
- `src/modules/annual-review/DOCUMENTATION.md` — add an "Internationalisation" section: how the precedence works, where to add static keys, how admins author template translations, list of supported keys.
- `src/modules/annual-review/POLICY.md` — add rule: "Every user-visible string in the annual review module MUST go through `useAnnualReviewI18n().t(...)`. Template-authored content MUST go through `tTemplate(...)`."
- `mem/features/annual-review/overview.md` — append note that the i18n context is the SSOT and child components must consume it.

## Out of scope
- New languages beyond en/hi/es.
- Translating PMS / Carry-KRA monthly data (numbers).
- Admin UI for editing per-template translations (already exists via the Template Editor JSON; no change needed).

## Rollback
Each step is additive (provider + key lookups). Reverting the patch removes the provider and restores the English literals — no schema, no data, no RPC changes to undo.
