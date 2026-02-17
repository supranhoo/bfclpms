

# Add "Create New" Options for Category, KRA, and KPI in "Assign New KRA" Dialog

## Current State

- **KRA Name**: Already has a combobox with "+ Enter custom KRA name" option. Working correctly.
- **KPI Name**: Already has a combobox with "+ Enter custom KPI name" option. Working correctly.
- **Category**: Uses a plain `<Select>` dropdown with no way to create a new category inline. This is the missing piece.

## What Will Change

### File: `src/components/admin/AdminKpiCreateDialog.tsx`

Replace the Category `<Select>` (lines 320-340) with a combobox (Popover + Command) following the same pattern already used for KRA and KPI fields.

**New state variables:**
- `categoryOpen` -- controls the combobox popover
- `isCustomCategory` -- toggles between dropdown and inline creation mode
- `customCategoryName`, `customCategoryWeightage`, `customCategoryColor` -- form fields for new category

**New import:**
- `useCreateKraCategory` from `useOrganization.ts` (already exported, accepts `{ name, weightage, color }`)

**UI behavior:**

Default mode (combobox):
- Searchable list of existing categories (same as current, with color dot and weightage %)
- At the bottom: "+ Create new category" option

Custom mode (inline form):
- Category Name input
- Weightage input (number, %)
- Color picker input (hex color)
- "Save" button that calls `useCreateKraCategory`, then auto-selects the new category ID
- Back arrow button to return to dropdown (same pattern as KRA/KPI)

### File: `DOCUMENTATION.md`

Document the new inline category creation capability.

## Technical Details

- The `useCreateKraCategory` hook (in `useOrganization.ts`) already invalidates the `kra-categories` query cache on success, so the new category will immediately appear in the dropdown
- After creating a new category, the mutation returns the new category object with its `id`, which will be set as `categoryId` to unlock the KRA Name field
- No database changes needed
- No new hooks needed

