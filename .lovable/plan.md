

## Plan: Make Slab Categories Dropdown Configurable

### Problem
The slab categories (PMS Score, Production, Availability, Maintenance, Metal Recovery) are hardcoded in `IncentiveSlabEditor.tsx` line 18-24. Adding/removing categories requires code changes.

### UI After Fix

**In the Slabs tab dropdown — with an "Add New" option at the bottom:**

```text
┌─────────────────────────────┐
│ Slab Category  [▼]         │
├─────────────────────────────┤
│  PMS Score                  │
│  Production                 │
│  Availability               │
│  Maintenance                │
│  Metal Recovery             │
│ ─────────────────────────── │
│  ＋ Add New Category        │
└─────────────────────────────┘
```

**When "Add New" is clicked — inline input replaces dropdown (same pattern as ProgramTypeSelector):**

```text
┌────────────────────────────────────────────┐
│ [ e.g. Safety Score     ] [✓] [✕]         │
└────────────────────────────────────────────┘
```

**Admin can also manage categories from a settings area — simple list with delete:**

```text
┌──────────────────────────────────────────┐
│ Slab Categories                          │
├──────────┬───────────────────────┬───────┤
│ Value    │ Label                 │       │
├──────────┼───────────────────────┼───────┤
│ pms_score│ PMS Score             │  🗑   │
│ production│ Production           │  🗑   │
│ availability│ Availability       │  🗑   │
│ maintenance│ Maintenance         │  🗑   │
│ metal_recovery│ Metal Recovery   │  🗑   │
└──────────┴───────────────────────┴───────┘
```

### Changes

**1. DB Migration — Create `incentive_slab_categories` table + seed defaults**

```sql
CREATE TABLE public.incentive_slab_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value text UNIQUE NOT NULL,
  label text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.incentive_slab_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON public.incentive_slab_categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage" ON public.incentive_slab_categories
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Seed existing hardcoded values
INSERT INTO public.incentive_slab_categories (value, label, sort_order) VALUES
  ('pms_score', 'PMS Score', 1),
  ('production', 'Production', 2),
  ('availability', 'Availability', 3),
  ('maintenance', 'Maintenance', 4),
  ('metal_recovery', 'Metal Recovery', 5);
```

**2. `src/hooks/useIncentiveSlabCategories.ts`** — New hook (same pattern as `useIncentiveProgramTypes`)
- `useIncentiveSlabCategories()` — query all, ordered by `sort_order`
- `useCreateSlabCategory()` — insert mutation
- `useDeleteSlabCategory()` — delete mutation

**3. `src/components/incentive/SlabCategorySelector.tsx`** — New component (mirrors `ProgramTypeSelector`)
- Dropdown with all categories from DB
- "Add New" option at bottom triggers inline input with confirm/cancel
- Used in `IncentiveSlabEditor` and `ProductionTargetGrid`

**4. `src/components/incentive/IncentiveSlabEditor.tsx`**
- Remove `SLAB_CATEGORIES_BASE` constant
- Replace hardcoded `Select` with `<SlabCategorySelector>`
- Filter logic for `support` programs stays — filter categories to only `pms_score` when `programType === 'support'`

**5. `src/components/incentive/ProductionTargetGrid.tsx`**
- Replace any hardcoded slab category references with the DB-driven list

**6. `DOCUMENTATION.md`** — v2.15.11 changelog

**7. `POLICY.md`** — Add invariant: slab categories must be master-data driven, never hardcoded

### Files Modified

| File | Change |
|------|--------|
| DB migration | Create `incentive_slab_categories` table with RLS + seed data |
| `src/hooks/useIncentiveSlabCategories.ts` | New hook: CRUD for slab categories |
| `src/components/incentive/SlabCategorySelector.tsx` | New reusable dropdown with inline add |
| `src/components/incentive/IncentiveSlabEditor.tsx` | Remove hardcoded array; use `SlabCategorySelector` |
| `src/components/incentive/ProductionTargetGrid.tsx` | Use DB-driven categories if applicable |
| `DOCUMENTATION.md` | v2.15.11 changelog |
| `POLICY.md` | Zero-hardcoding invariant for slab categories |

### Risk Assessment
- **Regression**: Zero — seeded data matches existing hardcoded values exactly
- **Data**: Existing `slab_category` text values in `incentive_slabs` and `production_targets` remain valid since seed values use the same strings
- **Performance**: Single lightweight query cached by React Query

