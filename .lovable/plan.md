## Root cause

When criteria are pulled in via **Add from Library**, `CriteriaLibraryPickerDialog.rowToCriterion` only copies `label_en` into `criterion.name` and leaves the description blank. It does **not** write the library row's `label_hi` (or the per-option `label_hi` decoded from `scoring_bands`) into `sections.translations.hi`, which is the map the editor's "HI name / HI description / HI option label" inputs read from. Result: rows appear in the table with empty Hindi fields even though the library carries the Hindi text.

The Blue-Collar preset works because it ships an inline `translations.hi` block keyed to fixed criterion ids; the library path skipped that step.

## Fix

Seed the translation map alongside the new criteria rows so the Hindi inputs render populated and the reviewer-facing bilingual rendering works out of the box.

### `src/components/annual-review/CriteriaLibraryPickerDialog.tsx`
- Change `rowToCriterion` to return both the `TemplateCriterion` and a `Record<string,string>` of Hindi keys for that row:
  - `criterion:<new id>:name` → `r.label_hi` (when present)
  - `option:<new id>:<optId>:label` → each option's `label_hi` (from `bandsToBilingualOptions`, when present)
- Pass the combined translation delta through `onAdd`, e.g. change the signature to `onAdd(items, hiTranslations)` (English-only rows contribute an empty delta — no behaviour change for them).

### `src/components/annual-review/TemplateEditorDialog.tsx`
- In the `<CriteriaLibraryPickerDialog onAdd=…>` handler, merge `hiTranslations` into `sections.translations.hi` in the same `setSections` call that appends the criteria. Only touch the `hi` bucket; leave other languages and existing keys untouched (new keys overwrite only their own slot).
- If `settings.enable_multilingual` is false or `hi` isn't in `available_languages`, still write the translations (harmless) but skip UI churn — the inputs simply won't render until the admin turns Hindi on. No toast change needed.

### Tests
- Extend `src/services/annualReview/criteriaLibrary.test.ts` (or add a small sibling test for the picker mapper) covering:
  - Library row with `label_hi` + bilingual bands → returned translation delta has `criterion:<id>:name` and one `option:<id>:oN:label` per band with a Hindi label.
  - Library row without any Hindi text → returned delta is empty; existing English behaviour unchanged.

## Not touched

- No schema, RLS, service, or export changes.
- No changes to the Blue-Collar preset, manual-add flow, or self-review library.
- Reviewer form rendering already handles `option:<critId>:<optId>:label` (see `tTemplateOptionBilingual`), so no downstream edits needed.

## Risk

Low. Purely additive to `translations.hi` on library import; existing templates and the Auto-Populate preset are unaffected.
