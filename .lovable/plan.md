## Problem

In `EmployeeAnnualReview`, the **Qualitative Responses** section (image attached) renders English labels and `"Write here..."` placeholders even when the user switches language to Hindi. The section title itself translates correctly because it uses the static UI key `section.qualitative`, but each individual field's label and placeholder do not.

## Root Cause

`src/pages/annual-review/EmployeeAnnualReview.tsx` (lines 192, 195) renders qualitative fields like this:

```tsx
<Label>{t(`field.${f.id}`, f.label)}…</Label>
<Textarea placeholder={f.placeholder} … />
```

Two bugs:
1. Uses the static `t()` translator with a **dot-separated** key (`field.<id>`), but the Template Editor saves translations under **colon-separated** template keys (`field:<id>:label`, `field:<id>:placeholder`). So even when admin enters Hindi text for the field in the editor, the renderer never finds it.
2. `placeholder` is passed through raw — never translated at all.

The admin-side editor already collects both `field:<id>:label` and `field:<id>:placeholder` correctly (`TemplateEditorDialog.tsx` lines 477-481). The data is there; the renderer just isn't reading it.

## Plan

### 1. Fix renderer — `src/pages/annual-review/EmployeeAnnualReview.tsx`
- Pull `tTemplate` from `useAnnualReviewI18n()` (already imported in the file).
- Replace `t(\`field.${f.id}\`, f.label)` with `tTemplate('field', f.id, 'label', f.label)`.
- Translate placeholder: `placeholder={tTemplate('field', f.id, 'placeholder', f.placeholder ?? '')}`.

This automatically respects the per-template **display mode** (bilingual / english_only / translated_only) because `tTemplate` already encapsulates that logic.

### 2. Tests — extend `src/test/annualReview/i18nDisplayMode.test.tsx`
Add one assertion per mode that `tTemplate('field', 'f1', 'label', 'EN label')` resolves correctly given a `field:f1:label` translation entry. This locks in the colon-key contract for `field`.

### 3. Docs
- `src/modules/annual-review/DOCUMENTATION.md` — note that `Self Review Fields` labels & placeholders translate via `tTemplate('field', …)` using `field:<id>:label` / `field:<id>:placeholder` keys.
- `mem/design/annual-review-bilingual-options.md` — append a line: "Qualitative field labels/placeholders also use the canonical colon-key shape and respect `display_mode`."

## Out of Scope
- No schema/migration change (translations already persisted).
- No edits to `TeamAnnualReview` (qualitative remarks there live inside the scoring matrix, not as standalone fields).
- No new admin UI — the existing per-language inputs in the Template Editor already cover label + placeholder.

## Risk
- **Data:** none — read-only resolver change.
- **Workflow:** none — scoring/persistence unchanged.
- **UI:** Hindi/Spanish reviewers will now see translated label + placeholder for qualitative fields. English reviewers and templates without translations see the existing English text (fallback).
- **Regression:** very low — change is one component, two lines.
