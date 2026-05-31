# Inline-edit Increment Slabs grid (one screen)

## Goal
Replace the side-sheet editor with a single full-width table where every slab row shows its scope (Company, Division, Business Unit, Location, Employee Category, Level) by **name** and is editable in place. "Add Slab" simply appends a blank editable row — no other fields, no popup.

## Feasibility
Fully feasible. All data and helpers already exist:
- `useEligibilityMasters()` returns `companies / divisions / business_units / locations / employee_categories / levels` (id+name).
- `MultiSelectFilter` already shows selected names with chips and a count badge — perfect for compact cells.
- `useUpsertSlab` / `useDeleteSlab` already handle per-row save/delete.
- Specificity, duplicate-scope guard, and validation move from sheet to row-level (toast on Save).

The only cost is horizontal width. With 11 columns we need a horizontally scrollable table on viewports < ~1500px (the page is `max-w-7xl` already). We use `overflow-x-auto` and tight min-widths per cell — acceptable for an admin grid (matches existing dense tables like KPI matrix).

## UI Changes (single screen)

Location: `/admin/increment/slabs`

```text
AY [2025-26 ▼]   [Copy Previous Year]   [+ Add Slab]

┌───────────┬──────────┬───────────┬─────────────┬───────────────┬─────────────┬──────────────────┬──────────┬──────────┬─────────┐
│ Rating    │ Increment│ Company   │ Division    │ Business Unit │ Location    │ Employee Category│ Level    │ Prorate  │ Action  │
│ From → To │   %      │           │             │               │             │                  │          │ on DOJ   │         │
├───────────┼──────────┼───────────┼─────────────┼───────────────┼─────────────┼──────────────────┼──────────┼──────────┼─────────┤
│ [4.75]→[5]│ [12.00]  │ BFCL ▼    │ All ▼       │ All ▼         │ Plant-1 ▼   │ Confirmed ▼      │ L4 ▼     │  [✓]     │ 💾 🗑   │
│ [4.50]→[4│ [10.00]  │ BFCL,GHCL▼│ Steel ▼     │ 2 selected ▼  │ All ▼       │ Confirmed,ESI ▼  │ L3,L4 ▼  │  [✓]     │ 💾 🗑   │
│ …                                                                                                                              │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Cell behavior:
- **Rating From / To / Increment %**: small numeric `<Input>` (~80–96px wide).
- **Company / Division / BU / Location / Employee Category / Level**: `MultiSelectFilter` trigger that shows the selected name when 1 chosen, "N selected" when many, "All" placeholder when empty. Width 180–220px each.
- **Prorate on DOJ**: checkbox.
- **Action**: Save (only enabled when row is dirty), Delete. New unsaved rows show Save + Cancel.

Header row: title row span auto for "Rating From / To" combined cell label "Rating Band" with two inputs side-by-side, or keep as two columns — confirm in build.

Side `Sheet` editor is **removed**. "Add Slab" appends one blank row at the top of the table in dirty/unsaved state with focus on Rating From.

Specificity badge stays as a tiny pill in the Action cell (e.g. `3/6`) so users can see scope weight without opening anything.

Validation (on Save click):
- `rating_to >= rating_from`, `0 <= increment_percent <= 100`
- Exact-scope duplicate check vs other rows
- On failure → red toast + row stays dirty.

## Responsive
- Table wrapped in `<div className="overflow-x-auto">` with `min-w-[1400px]` so all columns stay visible; horizontal scroll on smaller screens. No layout collapse.
- Sticky first 3 columns (Rating From / To / Increment %) on horizontal scroll using `sticky left-0 bg-background` so users always see the band while scrolling scope columns.

## Risk & Impact
- **Data**: zero schema change.
- **Logic**: same `useUpsertSlab`, same matcher, same edge function — only the editor surface changes.
- **UX regression**: removing the sheet means very wide screens get a dense grid. Mitigated by sticky band columns + horizontal scroll.
- **Perf**: each row mounts 6 multi-selects. For typical 4–10 slabs this is negligible; we lazy-render dropdown menus (already MultiSelect default).

## Implementation
1. `src/pages/increment/IncrementSlabs.tsx` — full rewrite of the page:
   - Drop `Sheet` / `SheetContent` / `editing` state.
   - Add `dirtyById: Record<string, Draft>` + one `newRow: Draft | null` for the unsaved Add.
   - Render the wide table with sticky columns; per-cell editors bound to drafts.
   - Per-row `Save` calls `upsert.mutateAsync`; `Cancel` discards.
   - Keep `ConfirmDestructiveDialog` for delete.
   - Show `Specificity n/6` pill in Action column.
2. No changes to `useIncrementSlabs`, `slabMatcher`, masters hook, or edge function.

## Tests
- Keep existing `slabMatcher.test.ts` (unchanged).
- Add `src/pages/increment/__tests__/IncrementSlabsRow.test.tsx` (light) for: invalid range blocks save; duplicate-scope blocks save; new row appears at top on Add Slab.

## Docs / Policy
- `DOCUMENTATION.md` Increment Slabs section: update screenshot/wording — "single inline-edit grid" instead of "side-panel editor".
- No POLICY change.

## Rollback
Revert the single `IncrementSlabs.tsx` file; everything else untouched.
