

# Restructure "Bulk Assign from Template" for 540+ Templates

## Problem

The template selector is a flat `<Select>` dropdown listing all 540 active templates. Users cannot search, filter by category, or navigate by KRA name. Finding a specific template requires scrolling through hundreds of items.

## Solution

Replace the single flat dropdown with a **cascading filter approach** (matching the pattern already used in AdminKpiCreateDialog):

1. **Category filter** -- narrows templates to a specific category (34 options)
2. **KRA Name filter** -- narrows within category (searchable)
3. **KPI Name selector** -- final pick from the filtered list (searchable)
4. **Auto-populated preview card** -- shows full details of the selected template

Additionally:
- Add a **text search** across all template fields (title, KRA name, KPI name) as a quick-find shortcut
- Show **template count badges** on each category
- Add **duplicate detection** -- warn if any selected employee already has this KPI assigned for the current period

## UI Layout (Template Selection Section)

```text
+--------------------------------------------------+
| Search templates...                    [x]       |
+--------------------------------------------------+
| Category          | KRA Name          | KPI Name |
| [All Categories v]| [Select KRA... v] | [Select v]|
+--------------------------------------------------+
| Selected: "Ensure raw material..."               |
| KRA: Statutory Compliance | KPI: ... | Target: 0 |
| Weightage: 7% | UOM: Number | Frequency: Monthly |
+--------------------------------------------------+
```

## Detailed Changes

### File: `src/components/admin/BulkTemplateAssignDialog.tsx`

**1. New state variables:**
- `templateSearch` -- free-text search across template title/KRA/KPI names
- `categoryFilter` -- filter templates by category_id
- `kraNameFilter` -- filter templates by KRA name within category

**2. Replace single Select with cascading filters:**

- **Category dropdown**: Derived from `templates` -- unique categories with counts. Selecting a category resets KRA and KPI selections.
- **KRA Name dropdown**: Filtered by selected category. Searchable via `cmdk` Command component (already in project). Selecting a KRA resets KPI selection.
- **KPI Name dropdown**: Filtered by selected category + KRA name. Selecting a KPI sets `selectedTemplateId`.

**3. Quick search bar:**
- A text input above the cascading filters that searches across `title`, `kra_name`, and `kpi_name` fields
- Results shown as a filtered list; selecting one auto-sets the category/KRA/KPI filters

**4. Enhanced preview card:**
- Show all key fields: KRA, KPI, Target, UOM, Weightage, Frequency, and R0-R5 thresholds
- Color-coded category badge

**5. Duplicate detection before assignment:**
- Before inserting, query existing KPIs for the selected employees + period + kra_name + kpi_name
- Show a warning listing employees who already have this KPI
- Allow the admin to proceed (skip duplicates) or cancel

**6. Multi-template selection (bonus):**
- Allow selecting multiple templates before assigning (add a "+" button to queue templates)
- Show a summary of queued templates with total weightage

### File: `DOCUMENTATION.md`
- Update bulk assignment section with new cascading filter and duplicate detection behavior

## Technical Detail

### Cascading Filter Logic

```typescript
const categories = useMemo(() => {
  const cats = new Map();
  templates?.filter(t => t.is_active).forEach(t => {
    if (t.kra_categories) {
      const existing = cats.get(t.kra_categories.id);
      cats.set(t.kra_categories.id, {
        ...t.kra_categories,
        count: (existing?.count || 0) + 1
      });
    }
  });
  return Array.from(cats.values());
}, [templates]);

const kraNames = useMemo(() => {
  if (!categoryFilter) return [];
  const names = new Set<string>();
  templates?.filter(t => t.is_active && t.category_id === categoryFilter)
    .forEach(t => names.add(t.kra_name));
  return Array.from(names).sort();
}, [templates, categoryFilter]);

const kpiOptions = useMemo(() => {
  return templates?.filter(t =>
    t.is_active &&
    (!categoryFilter || t.category_id === categoryFilter) &&
    (!kraNameFilter || t.kra_name === kraNameFilter) &&
    (!templateSearch || 
      t.title.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.kra_name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.kpi_name.toLowerCase().includes(templateSearch.toLowerCase()))
  ) || [];
}, [templates, categoryFilter, kraNameFilter, templateSearch]);
```

### Duplicate Detection

```typescript
// Before insert, check for existing assignments
const { data: existing } = await supabase
  .from('kpis')
  .select('employee_id, kra_name, kpi_name')
  .eq('kra_name', selectedTemplate.kra_name)
  .eq('kpi_name', selectedTemplate.kpi_name)
  .eq('review_period', currentPeriod)
  .eq('review_year', currentYear)
  .in('employee_id', Array.from(selectedEmployeeIds));

const duplicateEmployeeIds = new Set(existing?.map(e => e.employee_id));
const newEmployeeIds = Array.from(selectedEmployeeIds)
  .filter(id => !duplicateEmployeeIds.has(id));
```

## Files to Change

| File | Change |
|---|---|
| `src/components/admin/BulkTemplateAssignDialog.tsx` | Replace flat Select with cascading Category > KRA > KPI filters, add search, duplicate detection, enhanced preview |
| `DOCUMENTATION.md` | Document the improved bulk assignment workflow |

