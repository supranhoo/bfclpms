## Goal

Give Admins a per-template setting that controls how template text (criterion name, description, option labels, field labels) is shown to reviewers when a non-English language is active.

Three modes:
- **Bilingual** — `English / Translated` side-by-side (current behavior)
- **English only** — always show the authored English text, ignore translations
- **Translated only** — show only the translation in the active language; fall back to English when a translation is missing

## Risk & Impact

- Data: one new optional field `display_mode` on the template `sections` JSON. No schema migration needed (templates already store a free-form `sections` JSONB). Default `bilingual` preserves today's UI.
- Workflow: read-only setting — does not affect scoring, persistence, or stage logic.
- UI/UX: affects only how labels render in `CriteriaScoringMatrix`, plus a new selector in `TemplateEditorDialog` and the preview chip in `CriterionOptionsDialog`.
- Regression: low — current behavior maps to the new default `bilingual`.
- Mitigation: unit tests for all three modes × (translation present / missing) and a snapshot of the existing bilingual behavior.

## Implementation Steps

1. **Type** — `src/types/annualReview.ts`
   - Add `export type TemplateDisplayMode = 'bilingual' | 'english_only' | 'translated_only';`
   - Add optional `display_mode?: TemplateDisplayMode` on `TemplateSections`. Default treated as `bilingual` when missing.

2. **i18n context** — `src/components/annual-review/AnnualReviewI18nContext.tsx`
   - Accept `displayMode` prop (default `'bilingual'`).
   - `tTemplate(kind, id, field, fallback)` resolution:
     - `current === default` → fallback.
     - mode `english_only` → fallback.
     - mode `translated_only` → translation if present, else fallback.
     - mode `bilingual` → fallback (single-line names/descriptions stay single-language, as today).
   - `tTemplateBilingual(...)`:
     - `english_only` → fallback.
     - `translated_only` → translation if present, else fallback.
     - `bilingual` (current behavior) → `"<English> / <translated>"` when translation exists, else fallback.

3. **Provider wiring** — wherever `<AnnualReviewI18nProvider>` is mounted for the reviewer surfaces (`AnnualReviewEmployeeForm`, `AnnualReviewReviewerForm`, preview inside `TemplateEditorDialog`, `CriterionOptionsDialog`), pass `displayMode={template.sections.display_mode ?? 'bilingual'}`.

4. **Admin editor** — `TemplateEditorDialog`
   - Add a `Select` field "Reviewer display mode" with the three options and helper copy. Persist into `sections.display_mode`.
   - Show the same chip ("EN / HI", "EN only", "HI only") in the editor's existing language preview row so the admin sees what reviewers will see.

5. **Manage Custom Options dialog** — sync the existing `EN + HI` toggle chip to read the template's `display_mode`, so authoring preview matches the reviewer rendering.

6. **Docs + policy**
   - `src/modules/annual-review/DOCUMENTATION.md` — append entry describing the new per-template setting, default behavior, and rendering matrix.
   - `src/modules/annual-review/POLICY.md` — add: "Template display mode controls reviewer-facing label rendering only; persisted scores and option IDs are unaffected."
   - `mem/design/annual-review-bilingual-options.md` — update to record the new modes and that `bilingual` is the default.

## Tests

- `src/test/annualReview/i18nDisplayMode.test.ts` — table-driven test for `tTemplate` and `tTemplateBilingual` across all three modes × translation-present/missing × current==default.
- Extend `src/test/annualReview/criteriaScoringMatrixOptions.test.tsx` with three render cases (one per mode) asserting expected option label text.

## Out of Scope

- No DB migration. (Setting lives in the existing `sections` JSONB on `annual_review_templates`.)
- No per-user / global-system mode. Per-template only, as confirmed.
- No change to scoring, persistence, or workflow.
