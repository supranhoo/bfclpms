---
name: Self Review Field Library
description: Reusable curated + org-saved Self Review questions and bundles (EN + HI) plugged into the Annual Review Template Editor
type: feature
---
Tables: `annual_review_self_review_library` (kind=field|bundle, key unique, category, label_en/hi, placeholder_en/hi, required, is_builtin, is_active, sort_order) and `annual_review_self_review_bundle_items` (bundle_id, field_id, position) with a BEFORE trigger validating parent.kind='bundle' AND child.kind='field'.

RLS:
- SELECT: authenticated, active only (admin/hr_pms may also read inactive).
- INSERT/UPDATE: admin OR hr_pms.
- DELETE: admin OR hr_pms AND is_builtin = false. Built-ins are never hard-deletable — only `is_active` flipped.

Editor wiring (`TemplateEditorDialog.tsx`, Self Review Fields section only):
- `extraActions` slot of the SectionShell now exposes **Add from Library** → `SelfReviewLibraryPicker` (search + category chips + Fields/Bundles tabs + multi-select).
- Field Label input replaced with `SelfReviewLabelCombobox` — inline ≤8 suggestions when ≥2 chars typed; picking one auto-fills label/placeholder/required (+ HI translations if Hindi enabled).
- Admin/HR PMS sees **Manage library** drawer (`SelfReviewLibraryManager`) for CRUD; built-in delete button is hidden and the RLS DELETE policy enforces it server-side.

Bilingual rule: HI label/placeholder are written to `sections.translations.hi[field:<id>:label|placeholder]` **only** when the template has `settings.enable_multilingual === true` AND `'hi' ∈ settings.available_languages`. Otherwise a muted toast nudges the author to enable Hindi.

SSOT mappers in `src/services/annualReview/selfReviewLibrary.ts`:
- `mapEntryToTemplateField(entry, { includeHindi, makeId? })` → `{ field, translations }`
- `mapBundleToTemplateFields(fields, opts)` → `{ fields[], translations }`
- `applyEntriesToSections(sections, entries, opts)` — append-only, never clobbers prior `translations.hi` keys.

Each insert generates a fresh `SelfReviewField.id`, so duplicate inserts of the same library entry produce independent fields. Library entries are forward-compatible — new fields/bundles can be added by inserting rows, no code change required.