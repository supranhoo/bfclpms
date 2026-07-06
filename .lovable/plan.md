## Goal
Let template authors save a newly-created criterion into the shared Criteria Library from the Criteria table, so it becomes reusable via "Add from Library" across all templates.

## Where the change lives
`src/components/annual-review/TemplateEditorDialog.tsx` — the Criteria section table (screenshot). No other surfaces change.

## UX

Add a small **"Save to Library"** icon-button (Library icon) in each criterion row's actions cell, immediately to the left of the Trash icon.

Visibility & state per row:
- **Shown & enabled** — criterion has a `name` and is NOT already linked to a library entry (no `key` on the object, i.e. it was created via "Add Criterion" and not imported via "Add from Library").
- **Shown & disabled with tooltip "Already in library"** — criterion has a `key` (came from the library or was previously saved).
- **Hidden** — criterion has no name yet (nothing meaningful to save).

Click flow:
1. Opens a small confirm Popover anchored to the button with:
   - **Key** (auto-derived from EN name via `slugify(name)`; editable, lowercase/underscore-only, required, must be unique).
   - **Label EN** (prefilled from `c.name`, required).
   - **Label HI** (prefilled from the HI translation for that criterion, optional).
   - **Max score** (prefilled from `c.max_score ?? 5`).
   - Read-only note: "Scoring bands will be copied from the current options (N = X)."
   - Buttons: **Cancel** / **Save to Library**.
2. On save, call `upsertCriterion({ key, label_en, label_hi, max_score, scoring_bands, is_common: false, is_active: true, sort_order: 0 })` from `src/services/annualReview/criteriaLibrary.ts`.
3. On success:
   - Stamp the row's criterion in local editor state with `key`, `label_en`, `label_hi`, `max_score`, `scoring_bands` (so the button flips to "Already in library" without needing a save of the template).
   - Invalidate `['criteria-library-picker']` so the "Add from Library" dialog reflects it immediately.
   - Toast: `Saved "<label_en>" to the Criteria Library`.
4. On duplicate-key error: inline error under the Key field ("Key already used — pick a different key or import from library").

Because `scoring_bands` on the library row drives the picker's option regeneration, we serialize the current row's `options` back into a bands array (`[{ score, label_en, label_hi }, ...]`) using the existing bilingual options ↔ bands helpers already used by the picker (`bandsToBilingualOptions` inverse — add `bilingualOptionsToBands` in `src/lib/annualReview/criteriaBands.ts` if it doesn't exist).

## Technical details
- New small subcomponent `SaveCriterionToLibraryButton` inside `TemplateEditorDialog.tsx` (kept local; the file already hosts row subcomponents like `CriterionConfigPopover`, `CriterionOptionsButton`).
- New helper `bilingualOptionsToBands(options, max_score)` in `src/lib/annualReview/criteriaBands.ts` — pure, unit-tested; round-trips with the existing `bandsToBilingualOptions`.
- Uses existing service `upsertCriterion` (already exports from `criteriaLibrary.ts`, already has `onConflict: 'key'`).
- Reuses existing React Query key `['criteria-library-picker']` from `CriteriaLibraryPickerDialog.tsx` for invalidation.
- No DB migration, no RLS change, no schema change — the `annual_review_criteria_library` table is already writable by the same admin roles that reach this editor.

## Risk & Impact
- **Data**: Insert-only into an existing, already-editable admin table; unique constraint on `key` blocks duplicates.
- **Workflow**: Additive UI, no change to existing template save/publish logic.
- **UI**: One icon per row in an existing action cell; no layout reflow.
- **Regression risk**: Very low. Isolated to Criteria row actions and one pure helper.
- **Mitigation**: Unit tests for `bilingualOptionsToBands` round-trip; component test that the button is hidden when name is empty, disabled when `key` present, and calls `upsertCriterion` with the derived payload.

## Tests
- `src/lib/annualReview/criteriaBands.test.ts` — round-trip `bandsToBilingualOptions ↔ bilingualOptionsToBands`.
- Extend `CriteriaLibraryPickerDialog`/editor tests with a case that a criterion saved via this new button appears in the picker (mock service + query invalidation).

## Docs
- `DOCUMENTATION.md` — new version entry describing the "Save to Library" affordance.
- `POLICY.md` — extend §AR-CRITERIA-LIBRARY (or add new subsection) stating that criteria authored inline in a template MAY be promoted to the shared library by admins, keyed by a unique `key`, and that library rows remain the SSOT for reuse.

## Out of scope
- No bulk "Save all new criteria" action.
- No editing of existing library entries from this row (that stays in the Library admin surface).
- No assignment-matrix changes.
