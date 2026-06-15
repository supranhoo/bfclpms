# Carry KRA Editor — Discoverability Fix

## Assumptions
- The editor is **not missing**; it is correctly mounted under each **System Score** row when its `source = carry_kra` (see `TemplateEditorDialog.tsx` lines 247–304).
- It is **not** exposed on Criteria rows, and shouldn't be — Carry KRA is, by design, a pre-calculated percentage contribution (same shape as Safety/HR/Env), so it belongs in **System Scores**, not Criteria. Adding it to Criteria would change the scoring formula and violate the existing SSOT (`src/lib/annualReview/scoring.ts`).
- The real issue is **discoverability**: in the screenshot the System Scores section shows only generic empty-state text ("No system scores. These are pre-calculated percentage contributions (e.g. Safety, HR)."). Nothing tells the admin that Carry KRA lives here, and the "+ Add Score" button on the section header is easy to miss next to the much more visually prominent "+ Add Criterion" / "Auto-Populate Blue-Collar Template" buttons below.

## Risk & Impact Report
- **Data Impact:** None. No schema, no RLS, no migrations.
- **Workflow Impact:** None. No change to scoring math, eligibility, or reviewer chain.
- **UI/UX Impact:** Empty state of the System Scores section gets a clearer heading + an inline "Add Carry KRA score" shortcut button alongside the existing "Add Score". One-click adds a pre-configured row (`source: 'carry_kra'`, default `carry_config`), which immediately renders the Carry KRA Config Editor + "Preview employee mapping" collapsible. No other section changes.
- **Regression Risk:** Very low — scoped to the System Scores empty-state block. Existing "+ Add Score" button and behavior unchanged.
- **Scalability:** Not Applicable.
- **Mitigation:** Reuse the existing `setSections` updater shape used at line 250–252; no new state, no new types.

## Step-by-step Plan
1. In `src/components/annual-review/TemplateEditorDialog.tsx`, replace the System Scores empty-state body (currently the `<Empty msg=… />` on line 255) with a small CTA block that:
   - Keeps the existing explanatory copy.
   - Adds a secondary outline button **"+ Add Carry KRA Score"** that pushes a pre-configured row: `{ id: uid('sys'), name: 'Carry KRA Score', weight: 0, source: 'carry_kra', carry_config: { aggregation: 'overall_avg', excludeNa: true } }`.
   - Adds a one-line hint: *"Carry KRA pulls month-wise KPI scores from PMS history. Add a Carry KRA score to configure month selection and preview an employee mapping."*
   - Verification: With an empty system_scores list, the CTA renders. Clicking it adds exactly one row whose Source dropdown shows "Carry KRA Score (auto-fetched)" pre-selected and the Carry KRA Config Editor + Preview collapsible are visible immediately below.
2. Leave the "+ Add Score" header button untouched (still adds a `manual` row).
3. Update `src/modules/annual-review/DOCUMENTATION.md`: in the Carry KRA section, document where the editor lives ("System Scores section, per row, when Source = Carry KRA") and the new empty-state shortcut.
4. Update `src/modules/annual-review/POLICY.md`: one-line clarification that Carry KRA is a **System Score source**, not a Criterion source, and the rationale (already-weighted % contribution, same as Safety/HR).
5. Update `mem/features/annual-review/carry-kra-score.md`: append "Discoverability: System Scores empty state offers a one-click 'Add Carry KRA Score' shortcut. Carry KRA is never exposed on Criteria rows."
6. Add a small render test `src/test/annualReview/templateEditorCarryKraShortcut.test.tsx`: render `TemplateEditorDialog` with an empty template, click the shortcut, assert a system_scores row with `source: 'carry_kra'` appears and the preview collapsible trigger is in the DOM.

## UI Changes
- **Where:** `Templates → Edit/Create → System Scores` section, empty state only.
- **What changes:** Replace plain "No system scores…" empty state with a two-line CTA block + an outlined **"+ Add Carry KRA Score"** button (alongside the existing header "+ Add Score").
- **Interaction:** One click inserts a Carry KRA row pre-wired; the Config Editor + "Preview employee mapping" collapsible become visible immediately.
- **Responsiveness:** Inline-flex with wrap; mirrors existing section button styling — no new tokens.

## Tests
- New: `templateEditorCarryKraShortcut.test.tsx` — happy-path click adds a `carry_kra` row.
- Existing `carryKraMappingPreview.test.tsx` continues to cover the preview itself.

## Documentation Updates
- `src/modules/annual-review/DOCUMENTATION.md` — Carry KRA section: location of editor + shortcut.
- `src/modules/annual-review/POLICY.md` — clarify System Score vs Criterion separation for Carry KRA.
- `mem/features/annual-review/carry-kra-score.md` — discoverability note.

## Post-implementation Notes
If you actually want Carry KRA available as a **Criterion source** (not just a System Score), that's a separate, larger change: new field on `TemplateCriterion`, scoring math changes in `src/lib/annualReview/scoring.ts`, POLICY change, and migration of existing templates. Say the word and I'll plan that variant instead.
