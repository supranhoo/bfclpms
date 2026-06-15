## Root Cause

Translation keys are **stored** with colons but **read** with dots.

- `CriterionOptionsDialog` writes via `setTr(lang, \`option:${optId}:label\`, val)` — colon-separated. (lines 38, 102)
- `TemplateEditorDialog` writes criterion/field translations the same way: `criterion:ID:name`, `criterion:ID:description`, `field:ID:label`, `field:ID:placeholder`. (lines 378–462)
- `AnnualReviewI18nContext.tTemplate` / `tTemplateBilingual` look them up as `` `${kind}.${id}.${field}` `` — dot-separated.

Result: every template translation saved by the editor (Hindi option labels, criterion name, criterion description, custom field labels/placeholders) is silently invisible on the reviewer/employee UI. That is exactly the symptom in the screenshot — Hindi option text is missing from the option cards, and "Attendance & Punctuality" stays in English even though a translation exists in the dialog.

This is a one-line key-shape mismatch, not a data or RLS issue.

## Risk & Impact

- **Data**: none. Existing template `translations` JSON already uses colon keys; we align the reader to the data.
- **Workflow / RLS**: none.
- **UI**: Hindi/Spanish option labels begin rendering bilingually as designed. Criterion name + description and custom field labels also start translating (they were silently broken before — same bug, same fix). No layout change.
- **Regression**: very low. The current dot lookup never returns a hit, so swapping to colon only adds matches; English fallback path is unchanged. Tests that previously passed with mock translations using dot keys must be updated to the canonical colon shape (they're test-only mocks, not production data).
- **Performance**: O(1) lookup, unchanged.
- **Rollback**: revert the one helper.

## Plan

1. **`src/components/annual-review/AnnualReviewI18nContext.tsx`** — change the key builder in both `tTemplate` and `tTemplateBilingual` from `` `${kind}.${id}.${field}` `` to `` `${kind}:${id}:${field}` ``. Nothing else in the helper changes.

2. **`src/test/annualReview/criteriaScoringMatrixOptions.test.tsx`** — update the mock `hiTranslations` keys from `option.o5.label` / `criterion.attendance.name` etc. to the canonical `option:o5:label` / `criterion:attendance:name` so the regression test reflects production storage. Assertions stay identical.

3. **`src/test/annualReview/i18nFallback.test.ts`** (extend; create if missing) — add two cases:
   - `tTemplate` returns the colon-keyed translation when present, English fallback otherwise.
   - `tTemplateBilingual` returns `"EN / translated"` only when a colon-keyed translation exists and `current !== default`.

4. **`src/modules/annual-review/DOCUMENTATION.md`** — append a 2026-06-15 entry: "Template translation key shape standardized on `kind:id:field` (matches storage written by `TemplateEditorDialog` / `CriterionOptionsDialog`). Previous dot-separated reader was a bug — translations were saved but never matched."

5. **`src/modules/annual-review/POLICY.md`** — one line: template translation lookup key is `kind:id:field`; readers and writers must agree on this shape.

6. **`mem/design/annual-review-bilingual-options.md`** — update the rule snippet so the documented key shape is `option:ID:label` (was `option.ID.label`).

## What changes visually

Location: Annual Review → Employee / Reviewer page → "Self-Assessment Criteria" card → option cards (and the criterion name/description above them) when language = Hindi.

Before (today, broken):
```text
Attendance & Punctuality
I come to work on time, do not take unexcused leave…
[ ◯ Maintains equipment perfectly … ]    अंक: 5
```

After (fix):
```text
उपस्थिति और समय-पालन
मैं समय पर काम पर आता हूँ, बिना बताए छुट्टी नहीं लेता।
[ ◯ Maintains equipment perfectly / उपकरणों को एकदम सही रखते हैं … ]    अंक: 5
```

No layout, spacing, or component shape changes — only the strings that were already authored start showing.

## Out of scope
- Migrating any old data — the storage format is already colon-keyed.
- Changing the editor UI.
- Touching scoring math, RLS, or schemas.
