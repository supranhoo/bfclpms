

## Plan: Add Edit & Delete for Slab Category Dropdown Options

### What Changes

Add a "Manage Categories" button next to the dropdown that opens a popover/dialog listing all categories with inline edit and delete actions.

### UI

```text
┌──────────────────────────────────────────────────────────┐
│ [Safety ▼]  [⚙ Manage]                                  │
└──────────────────────────────────────────────────────────┘

Clicking "Manage" opens a popover:
┌──────────────────────────────────────────────┐
│ Manage Slab Categories                       │
├──────────────────────────────────────────────┤
│ PMS Score          [✏️] [🗑]                  │
│ Production         [✏️] [🗑]                  │
│ Availability       [✏️] [🗑]                  │
│ Maintenance        [✏️] [🗑]                  │
│ Metal Recovery     [✏️] [🗑]                  │
│ Safety             [✏️] [🗑]                  │
├──────────────────────────────────────────────┤
│ [+ Add New Category]                         │
└──────────────────────────────────────────────┘

Clicking edit icon on a row toggles inline edit:
│ [Safety Score    ] [✓] [✕]   │
```

### Changes

**`src/hooks/useIncentiveSlabCategories.ts`**
- Add `useUpdateSlabCategory()` mutation — updates `label` (and re-derives `value` from label) by `id`

**`src/components/incentive/SlabCategorySelector.tsx`**
- Add a `Settings` icon button next to the dropdown
- Render a `Popover` with the full category list
- Each row: label text + Edit (Pencil) + Delete (Trash) icons
- Edit: toggles inline input with confirm/cancel
- Delete: calls `useDeleteSlabCategory` with confirmation
- Add New row at the bottom (reuses existing create logic)
- If the currently selected category is deleted, reset selection to the first available

**`DOCUMENTATION.md`** — v2.15.13 changelog

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useIncentiveSlabCategories.ts` | Add `useUpdateSlabCategory` mutation |
| `src/components/incentive/SlabCategorySelector.tsx` | Add manage popover with edit/delete per category |
| `DOCUMENTATION.md` | v2.15.13 changelog |

### Risk Assessment
- **Regression**: Zero — dropdown behavior unchanged; manage UI is additive
- **Data**: Update mutates `label` + `value` in `incentive_slab_categories`; existing `slab_category` text in `incentive_slabs` will need manual reconciliation if value changes (edge case — warn admin via toast)

