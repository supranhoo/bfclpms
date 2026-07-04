# Fix: Hindi option label edits leak across criteria

## Root cause

`CriterionOptionsDialog` writes option translations using the key
`option:<optionId>:label` (see `src/components/annual-review/CriterionOptionsDialog.tsx` lines 38 & 102). `CriteriaScoringMatrix` reads the same key (line 125).

The seeded Blue-Collar preset (and any template built by duplicating options) reuses the same option IDs (`o5`, `o4`, `o3`, `o2`, `o1`, `o0`) across **every** criterion. Because the translation key is not namespaced by criterion, editing the Hindi label for one criterion's `o5` overwrites the shared `option:o5:label` entry — so every other criterion whose `o5` option renders the same Hindi text.

This is a real application bug, not a data-entry mistake.

## Fix

Namespace option translation keys by criterion ID:

- New key shape: `option:<criterionId>:<optionId>:label`
- Legacy key `option:<optionId>:label` remains readable as a **fallback only** so previously-saved translations still render until re-edited.

### Writer — `CriterionOptionsDialog.tsx`
- Seed `trBuf` from `option:<criterion.id>:<opt.id>:label`, falling back to legacy `option:<opt.id>:label` when the new key is empty (one-time migration on first open).
- On save, write to the new namespaced key only. Do not touch legacy keys (harmless; ignored once the new key exists).

### Reader — `CriteriaScoringMatrix.tsx`
- Change both call sites (lines 77 and 125) to try the namespaced key first, then fall back to the legacy key. Since `tTemplateBilingual` accepts `(kind, id, field, fallback)`, extend `AnnualReviewI18nContext` with a small helper `tTemplateOptionBilingual(criterionId, optionId, fallback)` that internally checks `option:<criterionId>:<optionId>:label` then `option:<optionId>:label`. Keep the existing generic helpers unchanged to avoid touching other callers.

### Context — `AnnualReviewI18nContext.tsx`
- Add `tTemplateOption(criterionId, optionId, field, fallback)` and `tTemplateOptionBilingual(...)` with the same display-mode semantics (`bilingual` / `english_only` / `translated_only`) as the existing bilingual resolver, plus legacy-key fallback.

### Types
- No schema change. Translation payload (`TemplateSections.translations`) is untyped `Record<lang, Record<key, string>>` — new keys coexist with old.

## Files touched

- `src/components/annual-review/CriterionOptionsDialog.tsx` — read/write use namespaced key + legacy fallback on seed.
- `src/components/annual-review/AnnualReviewI18nContext.tsx` — add `tTemplateOption` / `tTemplateOptionBilingual` with legacy fallback.
- `src/components/annual-review/CriteriaScoringMatrix.tsx` — use the new option-aware helper at both call sites.
- `src/test/annualReview/criteriaScoringMatrixOptions.test.tsx` — extend existing test with a case proving two criteria that share option ID `o5` render **different** Hindi labels when translations use the new namespaced key, and legacy key still resolves when the new key is missing.
- `src/modules/annual-review/DOCUMENTATION.md` — Version-history entry.
- `src/modules/annual-review/POLICY.md` — Note the canonical translation key shape for options.
- `mem/design/annual-review-bilingual-options.md` — update the "Translation key shape" section to document the new option namespacing + legacy fallback.

## Risk & impact

- **Data:** Additive. No migration needed. Existing `option:<optId>:label` entries continue to render via fallback until a user re-edits the criterion, which persists a new namespaced entry.
- **Workflow / RLS:** None.
- **UI/UX:** No visible change unless the bug reproduces; after the fix, per-criterion Hindi option labels are independent.
- **Regression risk:** Low. The generic `tTemplateBilingual` API is untouched; only the option-label call sites move to the new helper.
- **Rollback:** Revert the four source files; legacy keys were never removed.

## Tests

- Unit test: two criteria with shared `o5`, different Hindi labels written under namespaced keys → each criterion renders its own Hindi label.
- Unit test: only legacy key present → both criteria still render the legacy label (backward compat).
- Existing `criteriaScoringMatrixOptions.test.tsx` scenarios continue to pass.
