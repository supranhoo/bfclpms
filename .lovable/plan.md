# Increment Slabs — Compact Row + View/Edit Modal

## Assumptions
- Keep current DB schema, hooks, matcher, and edge function untouched. UI-only change.
- "View / Edit" modal is the single editor. Inline grid editing is removed to eliminate horizontal scroll.
- Future scope/criteria columns (e.g. Employment Status, Service Eligibility) should appear in the modal automatically by driving the form from a config array.

## Risk & Impact Report
- **Data Impact:** None — no schema or RLS change.
- **Workflow Impact:** None — same save/delete/copy-year flows; only the editor surface changes.
- **UI/UX Impact:** Removes horizontal scroll. Row becomes a summary; full configuration moves to modal. Matches preferred Option 1 in the requirement.
- **Regression Risk:** Low. `useUpsertSlab`, `slabMatcher`, `compute-increment` edge function unchanged. Validation logic (range, %, duplicate scope) is moved verbatim from inline-Save into modal-Save.
- **Scalability:** Modal is rendered from a `SLAB_DIMENSIONS` config array — adding a new scope dimension only requires appending to the config + (eventually) a column on the table. No layout work.
- **Mitigation:** Keep `slabMatcher.test.ts` green; add modal tests for validation; preserve specificity badge + scope summary on the row.

## UI Changes

Route: `/admin/increment/slabs`

**Row (no horizontal scroll, fits 929px viewport):**
```text
┌──────────────┬───────────┬────────────────────────────────────┬──────────┬─────────────────┐
│ Rating Band  │ Increment │ Scope summary                      │ Specific.│ Actions         │
├──────────────┼───────────┼────────────────────────────────────┼──────────┼─────────────────┤
│ 4.75 → 5.00  │  12.00 %  │ BFCL · Steel · 2 BUs · Confirmed   │   4/6    │ 👁 View/Edit  🗑│
│ 4.50 → 4.74  │  10.00 %  │ All employees                      │   0/6    │ 👁 View/Edit  🗑│
└──────────────┴───────────┴────────────────────────────────────┴──────────┴─────────────────┘
```
- Scope summary uses `describeScope()` (already exists) with the masters name resolver — shows real names, truncates with tooltip when long.
- "Prorate on DOJ" shown as a small badge in the Increment cell when true (`12.00% · pro-rata`).
- `+ Add Slab` button in the header opens the modal in create mode (no inline blank row).

**Modal (`Dialog`, max-w-3xl, scroll-y):**
```text
┌─ Edit Slab ──────────────────────────────────────────── ✕ ─┐
│ Rating Band                                                │
│  Rating From [ 4.75 ]   Rating To [ 5.00 ]   Increment % [12]│
│  [✓] Prorate on DOJ                                        │
│                                                            │
│ Scope (leave blank = applies to all)                       │
│  Company         [ MultiSelect: BFCL, GHCL …          ▾ ] │
│  Division        [ MultiSelect: Steel …               ▾ ] │
│  Business Unit   [ MultiSelect: 2 selected            ▾ ] │
│  Location        [ MultiSelect: All                   ▾ ] │
│  Employee Cat.   [ MultiSelect: Confirmed, ESI        ▾ ] │
│  Level           [ MultiSelect: L3, L4                ▾ ] │
│                                                            │
│ Remarks (optional)                                         │
│  [ stored in extra_attributes.remarks                    ] │
│                                                            │
│ Specificity: 4/6   ·   Matches: Company, Division, BU, Cat │
│                                                            │
│                              [ Cancel ]   [ Save Slab ]    │
└────────────────────────────────────────────────────────────┘
```
- Form fields generated from a single `SLAB_DIMENSIONS` config array → future dimensions appear automatically.
- Validation on Save (same rules as today): `rating_to >= rating_from`, `0 ≤ % ≤ 100`, exact-scope duplicate check vs other rows in same AY → red toast on failure, modal stays open.
- Delete stays on the row, gated by `ConfirmDestructiveDialog` (unchanged).
- Historical rows: open the modal in read-only mode for archived AY (later — out of scope for this change; structure supports it).

## Implementation
1. `src/pages/increment/IncrementSlabs.tsx` — rewrite page:
   - Remove inline-edit drafts, sticky columns, `min-w-[1500px]` wrapper.
   - Render compact 5-column table (Band / Increment / Scope / Specificity / Actions).
   - `View/Edit` button opens new `SlabEditorDialog` with the row's data; `Add Slab` opens it in create mode.
2. New `src/components/increment/SlabEditorDialog.tsx`:
   - Props: `open`, `onOpenChange`, `slab | null` (null = create), `assessmentYear`, `existingSlabs` (for dup check), `masters`.
   - Renders the rating block + a loop over `SLAB_DIMENSIONS` for scope multi-selects + remarks field + footer.
   - Owns local draft state, validation, and calls `useUpsertSlab.mutateAsync` then closes on success.
3. New `src/lib/slabDimensions.ts`:
   - Exports `SLAB_DIMENSIONS` array describing each scope field (`key`, `label`, `mastersKey`, `icon`). Used by the dialog and by `describeScope` callers for naming consistency. Driving config = "future criteria column" extensibility.
4. No changes to: `useIncrementSlabs`, `useIncrementEligibility`, `slabMatcher.ts`, `compute-increment` edge function, DB schema, RLS.

## Tests
- Keep `slabMatcher.test.ts` (10/10) untouched.
- Add `src/components/increment/__tests__/SlabEditorDialog.test.tsx`:
  - Renders all dimension fields from `SLAB_DIMENSIONS` (proves future-column auto-appear).
  - Blocks save when `rating_to < rating_from`.
  - Blocks save on exact-scope duplicate within the same AY.
  - Calls `onUpsert` with the correct payload on valid Save.

## Docs / Policy
- `DOCUMENTATION.md` → Increment Slabs section: replace "inline-edit grid" with "compact row + View/Edit modal; all scope dimensions edited inside the modal; row shows scope summary and specificity."
- `POLICY.md` → no change (matching/specificity rules unchanged).
- Add Version History entry: "Increment Slabs editor moved from inline grid to modal for scalability of scope dimensions."

## Rollback
Revert `IncrementSlabs.tsx`, delete `SlabEditorDialog.tsx` and `slabDimensions.ts`. No data migration to undo.
