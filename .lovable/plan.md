

# Smart Org KPI Data Entry: Employee-Mapped Filter + Org-Level Suggestions

## Overview

Three interconnected features to make the Org KPI Data Entry page smarter:

1. **Hide unmapped KPIs** -- Only show KPIs that have at least one employee assigned
2. **Suggest candidates** -- Show non-org KPIs that appear across many employees as potential org-level KPIs
3. **Bulk mark similar** -- When one KPI is marked org-level, suggest marking all matching KPIs (same kra_name + kpi_name across categories/employees)

---

## Feature 1: Only Show Employee-Mapped KPIs in Data Entry

**Current behavior**: All KPIs with `is_org_level = true` appear in Data Entry, even if no employee has that KPI assigned.

**New behavior**: Filter the list to only include org-level KPIs where at least one employee record exists with matching `category_id + kra_name + kpi_name` in the same period.

### Changes

**`src/hooks/useOrgLevelKpis.ts`** -- Add a new hook `useOrgLevelKpisWithEmployees` that:
1. Fetches org-level KPIs as before
2. Also queries employee counts per KPI (grouped by category_id, kra_name, kpi_name)
3. Filters out KPIs with 0 employees mapped
4. Returns `employeeCount` alongside each KPI for display

**`src/pages/admin/OrgKpiDataEntry.tsx`** -- Switch to the new hook. Show a badge on each card showing "X employees mapped". Add an info banner for KPIs that exist but have no employees (count shown in the warning).

---

## Feature 2: Org-Level KPI Suggestions

**Purpose**: Help admins discover KPIs that should be org-level by analyzing which non-org KPIs are shared across many employees.

### Logic
- Query all KPIs where `is_org_level = false` for the selected period
- Group by `kra_name + kpi_name + category_id`
- Count distinct employees
- Show KPIs with 3+ employees as "candidates"
- If a KPI with the same `kra_name + kpi_name` already exists as org-level, highlight it as "partially marked"

### Changes

**New hook: `src/hooks/useOrgKpiSuggestions.ts`**
- Queries non-org KPIs grouped by name with employee counts
- Returns suggestions sorted by employee count (most shared first)
- Includes whether a matching org-level KPI already exists

**New component: `src/components/admin/OrgKpiSuggestionsPanel.tsx`**
- A collapsible panel/card shown on the Data Entry page (above the KPI cards)
- Shows a table of suggested KPIs with columns: KRA, KPI, Category, Employee Count, Action
- "Mark as Org-Level" button per row
- "Mark All Similar" bulk button (ties into Feature 3)
- Badge showing suggestion count (e.g., "12 suggestions")

**`src/pages/admin/OrgKpiDataEntry.tsx`** -- Add a new tab "Suggestions" alongside "Data Entry" and "Data Owners"

---

## Feature 3: Bulk Mark Similar KPIs as Org-Level

**Purpose**: When admin marks one KPI as org-level, auto-detect all other employee KPI records with the same `kra_name + kpi_name` (potentially across different categories) and offer to mark them all as org-level in one click.

### Logic
1. When admin clicks "Mark as Org-Level" on a suggestion:
   - Find all KPI records with same `kra_name + kpi_name` in the period
   - Show a confirmation dialog listing: how many records, which categories, which employees
   - On confirm, bulk-update all matching records to `is_org_level = true`
2. "Mark All Similar" button on the suggestions panel:
   - Same as above but processes multiple suggested KPIs at once

### Changes

**New hook: `src/hooks/useMarkAsOrgLevel.ts`**
- `useMarkKpiAsOrgLevel` mutation: updates all matching KPI records to `is_org_level = true` with optional `org_level_scope`
- `useBulkMarkAsOrgLevel` mutation: processes multiple KPI groups at once
- Returns count of affected records

**New component: `src/components/admin/MarkOrgLevelDialog.tsx`**
- Confirmation dialog showing:
  - KPI name and KRA
  - Number of employee records that will be affected
  - Scope selector (Organization / Department / Employee)
  - List of similar KPIs found (same kra_name + kpi_name in other categories)
  - Checkbox to include similar KPIs in other categories
- "Confirm" button triggers the bulk update

**`src/components/admin/OrgKpiSuggestionsPanel.tsx`** -- Each row has "Mark as Org-Level" which opens the dialog. A header checkbox + "Bulk Mark Selected" button for multi-select.

---

## Technical Details

### New Files

| File | Purpose |
|---|---|
| `src/hooks/useOrgKpiSuggestions.ts` | Query non-org KPIs grouped by name with employee counts |
| `src/hooks/useMarkAsOrgLevel.ts` | Mutations to mark KPIs as org-level (single + bulk) |
| `src/components/admin/OrgKpiSuggestionsPanel.tsx` | Suggestions table with mark/bulk-mark actions |
| `src/components/admin/MarkOrgLevelDialog.tsx` | Confirmation dialog with scope selector and similar KPI detection |

### Modified Files

| File | Change |
|---|---|
| `src/hooks/useOrgLevelKpis.ts` | Add `useOrgLevelKpisWithEmployees` hook that filters by mapped employees |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Use new hook; add "Suggestions" tab; show employee count on cards; show unmapped count in warning |
| `src/components/admin/OrgKpiEntryCard.tsx` | Display "X employees" badge in the left info column |
| `DOCUMENTATION.md` | Document all three features |

### Database Queries (no schema changes needed)

**Suggestions query:**
```sql
SELECT k.kra_name, k.kpi_name, k.category_id, c.name as category_name,
       COUNT(DISTINCT k.employee_id) as employee_count,
       EXISTS(
         SELECT 1 FROM kpis o 
         WHERE o.is_org_level = true 
           AND o.kra_name = k.kra_name AND o.kpi_name = k.kpi_name
           AND o.review_period = k.review_period AND o.review_year = k.review_year
       ) as already_org_level
FROM kpis k
JOIN kra_categories c ON c.id = k.category_id
WHERE k.is_org_level = false
  AND k.review_period = ? AND k.review_year = ?
GROUP BY k.kra_name, k.kpi_name, k.category_id, c.name
HAVING COUNT(DISTINCT k.employee_id) >= 3
ORDER BY employee_count DESC
```

**Employee count per org KPI (for Feature 1 filtering):**
```sql
SELECT category_id, kra_name, kpi_name, COUNT(DISTINCT employee_id) as emp_count
FROM kpis
WHERE is_org_level = true AND review_period = ? AND review_year = ?
GROUP BY category_id, kra_name, kpi_name
```

**Bulk mark mutation:**
```sql
UPDATE kpis 
SET is_org_level = true, org_level_scope = ?
WHERE kra_name = ? AND kpi_name = ? 
  AND review_period = ? AND review_year = ?
```

### User Flow

```text
Admin opens Org KPI Data Entry
    |
    +-- "Data Entry" tab: Only shows KPIs with employees mapped
    |     Each card shows "12 employees" badge
    |     Warning banner: "5 org KPIs have no employees mapped"
    |
    +-- "Suggestions" tab (NEW): 
    |     Table of non-org KPIs shared by 3+ employees
    |     [Mark as Org-Level] per row -> opens confirmation dialog
    |     [x] Select multiple -> [Bulk Mark Selected]
    |
    +-- "Data Owners" tab: (unchanged)
```

