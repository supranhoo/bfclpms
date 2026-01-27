

# Add Org-Level KPI Scope Option (Organization-Wide vs Department-Specific)

## Problem Statement

Currently, organization-level KPIs (`is_org_level = true`) store a **single achieved value** in the `org_kpi_values` table that applies to **all employees** with that KPI. 

However, some org-level KPIs may need different values for different **departments**. For example:
- "Branch Profitability" might have the same value company-wide (Organization scope)
- "Department Budget Utilization" needs a separate value per department (Department scope)
- "5S Status" needs a separate value per Employee (Employee scope)


## Proposed Solution

Add a **scope** field to the `kpis` table that determines how org-level values are applied:

| Scope | Behavior |
|-------|----------|
| `organization` | Single value applies to ALL employees (current behavior) |
| `department` | Value is looked up by employee's department |
| `Employee` | Value is looked up by employee |

## Database Changes

### 1. Add `org_level_scope` column to `kpis` table
```sql
ALTER TABLE kpis 
ADD COLUMN org_level_scope text DEFAULT 'organization' 
CHECK (org_level_scope IN ('organization', 'department'));
```

### 2. Add `department_id` column to `org_kpi_values` table
```sql
ALTER TABLE org_kpi_values 
ADD COLUMN department_id uuid REFERENCES departments(id);
```

### 3. Update unique constraint on `org_kpi_values`
Currently: `category_id, kra_name, kpi_name, review_period, review_year`
New: Include `department_id` (nullable) for department-scoped values

```sql
-- Drop existing constraint
ALTER TABLE org_kpi_values DROP CONSTRAINT IF EXISTS org_kpi_values_unique_key;

-- Add new constraint that includes department_id
CREATE UNIQUE INDEX org_kpi_values_unique_idx 
ON org_kpi_values (category_id, kra_name, kpi_name, review_period, review_year, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'));
```

## UI Changes

### 1. Admin KPI Edit Dialog (`AdminKpiEditDialog.tsx`)
Add a scope selector that appears when "Organization-Level KPI" is toggled ON:

```
[x] Organization-Level KPI
    Scope: [Organization ▼]  ← New dropdown
           - Organization (same value for all)
           - Department (different value per department)
```

### 2. Org KPI Data Entry Page (`OrgKpiDataEntry.tsx`)
- For `organization` scope: Show single row per KPI (current behavior)
- For `department` scope: Show one row per department, allowing entry of different values

Example table layout for department-scoped KPIs:
| Category | KRA | KPI | Department | Target | Achieved | Data Source |
|----------|-----|-----|------------|--------|----------|-------------|
| Finance | Budget | Utilization | HR | 95% | 92% | ERP |
| Finance | Budget | Utilization | Sales | 95% | 88% | ERP |
| Finance | Budget | Utilization | IT | 95% | 96% | ERP |

### 3. Bulk Import (`import-kpis` edge function)
Add optional `orgLevelScope` column to Excel template:
- Accepts: `organization`, `department`, or blank (defaults to `organization`)

## Code Changes

### Files to Modify

| File | Changes |
|------|---------|
| **Database** | Add migration for new columns and constraints |
| `src/hooks/useOrgKpiValues.ts` | Update queries to handle `department_id` |
| `src/hooks/useOrgLevelKpis.ts` | Fetch `org_level_scope` field |
| `src/components/admin/AdminKpiEditDialog.tsx` | Add scope selector UI |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Handle department-scoped value entry |
| `src/pages/MyKpis.tsx` | Look up org values by scope (org-wide or employee's dept) |
| `src/pages/SelfReview.tsx` | Same lookup logic as MyKpis |
| `supabase/functions/import-kpis/index.ts` | Support `orgLevelScope` column |
| `src/lib/importValidation.ts` | Add validation for scope field |
| `DOCUMENTATION.md` | Document the new feature |

### Value Lookup Logic (Pseudocode)

```typescript
function getOrgKpiValue(kpi, employeeDepartmentId) {
  if (!kpi.is_org_level) return null;
  
  const key = kpi.org_level_scope === 'department'
    ? `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||${employeeDepartmentId}`
    : `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||null`;
  
  return orgKpiValuesMap.get(key);
}
```

## User Flow

### Setting Up a Department-Scoped Org KPI
1. Admin goes to **All KRAs** and edits a KPI
2. Toggles **Organization-Level KPI** ON
3. Selects **Scope: Department**
4. Saves the KPI

### Entering Department Values
1. Admin goes to **Org KPI Data Entry**
2. For department-scoped KPIs, sees multiple rows (one per department)
3. Enters different achieved values for each department
4. Saves all values

### Employee View
- Employee sees their KPI pre-filled with the value matching their department
- If no department match exists, shows "Pending" (value not yet entered)

## Summary

This enhancement provides flexibility for organization-level KPIs to either:
- Apply a **single value organization-wide** (current behavior, default)
- Apply **different values per department** (new capability)

The scope is configured per-KPI, allowing mixed usage within the same review period.

