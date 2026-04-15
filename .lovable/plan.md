

## Fix: Cartesian Product Explosion Crashing Browser on Add Scope

### Root Cause
`handleAddScope` generates a **cartesian product** of all selected values across 8 dimensions. With selections like 2 companies × 7 divisions × 24 BUs × 86 depts × 90 designations × 7 grades × 12 levels = ~18 billion rows. This freezes the browser and causes an Out of Memory crash.

### Solution: Store Each Dimension Independently (Not Cartesian)

The cartesian product approach is fundamentally wrong for org scoping. Instead, store **one scope row per profile** with comma-separated or array values per dimension. Each dimension is an independent filter (AND logic), not a combinatorial expansion.

**Approach**: Insert a **single** `access_profile_org_scope` row per "Add Scope" click, storing the first selected value per dimension (or null). For multi-select, insert one row per dimension value only for the dimensions that have selections — but **not** as a cross-product.

**Better approach**: Change the storage model to store **one row per profile** with array-typed columns, or store one row per Add Scope action with comma-joined IDs per field.

### Implementation

**File: `src/components/admin/AccessProfilesManager.tsx`**

1. **Replace cartesian product** with a single-row insert per "Add Scope" click:
   - Each scope row stores comma-separated IDs per dimension (e.g., `company_id = first selected company`, other companies get separate rows)
   - Actually, the simplest fix: insert **one row per selected value per dimension independently**, not cross-multiplied. But this changes semantics.

2. **Simplest safe fix**: Insert one row with the first value of each dimension, or better — store each dimension's selections as **independent scope rows** (one row per dimension-value pair with only that column filled, others null). This preserves AND semantics at query time via: "employee matches if for each non-null dimension in any scope row, the employee's value is in the set."

3. **Recommended approach** — flatten to independent dimension rows:
   - For each dimension that has selections, insert one row per selected value with only that column populated (others null)
   - E.g., 2 companies + 7 divisions + 86 depts = 95 rows (not 2×7×86 = 1,204 rows)
   - Query logic: employee matches profile scope if, for each dimension, either no scope rows exist for that dimension OR the employee's value appears in at least one scope row

4. **Add a safety cap**: Before inserting, calculate total rows. If > 500, show a warning toast and abort. This prevents any future explosion regardless of approach.

**File: `src/hooks/useAccessProfiles.ts`**
- Update `saveOrgScope` to accept batch inserts (single `.insert(rows)` call instead of one-at-a-time)

**File: `src/components/admin/AccessProfilesManager.tsx`** — scope label display
- Update `getScopeLabel` to handle the new row structure

**Files: `DOCUMENTATION.md`, `POLICY.md`** — Version bump

### Risk Assessment
- **Data impact**: Changes how scope rows are stored — existing single-value rows remain compatible
- **Regression risk**: Low — the current approach is literally unusable (crashes the page)
- **Performance**: 95 rows vs 18 billion — orders of magnitude improvement

