# Replace "Category" (KRA) with "Employee Category" in Increment Slabs

## Problem
The slab side-panel currently shows a "Category" dimension backed by `kra_categories` (used for KRA/KPI grouping). For increment slabs this is meaningless. Business needs to scope slabs by **Employee Category** (ESI, Non-ESI, Trainee, Confirmed, etc.), which lives in the `employee_categories` master and is stored on `profiles.employee_category` (text name, per the Employee Category & Employment Status policy).

## Risk & Impact
- **Data**: `increment_slabs.category_ids` shipped but has no production rows → safe to rename. Renaming avoids ambiguous columns and keeps history clean. Existing slabs (if any) with values would be discarded — confirmed none exist; we will still guard with a default-empty fallback.
- **Workflow**: No change to eligibility, scoring, or run pipeline beyond the matcher lookup key.
- **UI**: Only the slab side-panel "Category" row changes (label, icon, options source, placeholder). Table chip label changes from `Cat:` to `EmpCat:`.
- **Regression**: `slabMatcher.ts` unit tests stay green (dimension is renamed, not removed). Edge function `compute-increment` already pulls `profiles.employee_category` — we add a name→id lookup.
- **Mitigation**: Pure rename + new master source; backward-compatible JSON shape on the API side via a single `RENAME COLUMN`.

## UI Changes
Location: `/admin/increment/slabs` → "Edit Slab" / "Add Slab" side sheet (the panel in the screenshot).

Before → After (only the Category row):
```text
Category   [ All categories  ▼ ]   (KRA categories)
              ↓
Employee   [ All employee categories ▼ ]   (ESI, Non-ESI, Trainee, Confirmed …)
Category
```
- Icon: swap `Tag` → `Users` (lucide).
- Placeholder: "All employee categories".
- Multi-select, empty = applies to all (unchanged behavior).
- Specificity badge (`x / 6`) unchanged.
- Slab list row chip relabels `Cat: …` → `EmpCat: …`.
- No other dimension, no other page affected.

## Implementation

1. **Migration** (`supabase/migrations/<ts>_rename_slab_category_to_employee_category.sql`)
   - `ALTER TABLE public.increment_slabs RENAME COLUMN category_ids TO employee_category_ids;`
   - Update `increment_slabs_audit` trigger / snapshot column name if it references `category_ids` (verify in file before writing).

2. **Masters hook** (`src/hooks/useIncrementEligibility.ts → useEligibilityMasters`)
   - Replace the `kra_categories` query with `employee_categories` (id, name), keyed as `employee_categories` in the returned object. Keep `categories` key for any other consumer or rename consumers (search shows only IncrementSlabs uses it).

3. **Slab matcher** (`src/lib/slabMatcher.ts`)
   - Rename field `category_ids` → `employee_category_ids` on `SlabLike`.
   - Rename `EmployeeDims.category_id` → `employee_category_id`.
   - Update `DIMENSIONS` map and `describeScope` label (`Category` → `Emp Category`).
   - Update `slabMatcher.test.ts` field names; behavior tests unchanged.

4. **Slab UI** (`src/pages/increment/IncrementSlabs.tsx`)
   - Rename draft field, table chip, and side-panel row.
   - Swap icon `Tag` → `Users`; label "Employee Category"; placeholder "All employee categories".
   - Bind options to `masters?.employee_categories`.

5. **Hook payload** (`src/hooks/useIncrementSlabs.ts`)
   - Rename `category_ids` → `employee_category_ids` in the Slab type and upsert payload.

6. **Edge function** (`supabase/functions/compute-increment/index.ts`)
   - Build a `Map<lowercased name, id>` from `employee_categories` (already a fetched master if available, else add a fetch).
   - Resolve each profile's `employee_category` text → id and assign `employee_category_id` on the `EmployeeDims` object passed to `pickSlab`.
   - Update the legacy local `matchSlab` references (lines ~115–119, ~178, ~335) to the new field name. Remove the old `category_id` → `profiles.category_id` mapping (that was the KRA category UUID and never meaningful here).
   - Remarks string already comes from `describeScope`; verify label reads "Emp Category".

7. **Types** (`src/integrations/supabase/types.ts`) — auto-regenerated, do not edit by hand.

## Tests
- Update `src/lib/slabMatcher.test.ts` field names (`employee_category_ids`, `employee_category_id`) — all 9 cases stay valid.
- Add 1 case: slab scoped to `employee_category_ids: ['<trainee-id>']` matches only trainees, falls back to global for confirmed employees.

## Docs / Policy
- `DOCUMENTATION.md` Increment Slabs section: change dimension list from "Category (KRA)" → "Employee Category (ESI / Non-ESI / Trainee / Confirmed / …)" with a note that the source is the `employee_categories` master.
- `POLICY.md` Increment policy: add line "Slabs may be scoped by Employee Category. KRA category is not a valid scoping dimension for increments."
- Memory update: extend `mem://features/admin/employee-category-and-status` with one line noting Increment Slabs now scope by Employee Category.

## Rollback
Single migration; reverse with `ALTER TABLE … RENAME COLUMN employee_category_ids TO category_ids;` and revert the 5 frontend files. No data loss because column has no production rows.
