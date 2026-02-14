
# Auto-Generate KRA Bundles from Existing KPI Data

## Summary

Create all relevant KRA bundles automatically by analyzing the 4,693 KPIs already assigned across 63 employees. The system will extract unique KPI patterns per department+designation combination and generate templates and bundles for each.

## Current State

- **4,693 KPIs** assigned across **63 employees**
- **51 unique department + designation combinations**
- **~1,009 unique KPIs** (deduplicated by department, designation, KRA name, KPI name)
- **0 KPI templates** in the library
- **0 bundles** created

## What Will Be Created

- **~1,009 KPI Templates** in the KRA Library (one per unique KPI per department+designation)
- **51 KRA Bundles** (one per department + designation combination), e.g.:
  - "1050 TPD-E And I - Assistant General Manager" (19 KPIs)
  - "45 MW-Operation - Assistant General Manager" (40 KPIs)
  - "HR-Human Resources - Manager" (12 KPIs)
  - etc.

Each bundle will be linked to its department and designation, marked as active, and contain all the KPI templates relevant to that role.

## Approach

A database function will handle the entire operation in a single transaction for data integrity:

### Step 1: Create KPI Templates
For each unique KPI (grouped by department + designation + KRA name + KPI name), insert a `kpi_templates` record with:
- Title: "KRA Name - KPI Name" (truncated)
- All attributes: UOM, target, weightage, criteria, frequency, thresholds (R0-R5), source of data
- Category ID preserved
- Marked as active

### Step 2: Create Template Bundles
For each unique department + designation pair:
- Name: "{Department Name} - {Designation}"
- Linked to the department ID
- Linked to the designation
- Marked as active

### Step 3: Link Templates to Bundles
Create `template_bundle_items` rows linking each bundle to its corresponding templates with proper sort order.

## Technical Details

### Files to Create/Modify

| File | Change |
|---|---|
| New SQL migration | Database function `generate_bundles_from_kpis()` that performs all 3 steps |
| `src/pages/admin/TemplateBundles.tsx` | Add a "Generate from KPIs" button that calls the function and refreshes the list |
| `DOCUMENTATION.md` | Document the auto-generation feature |

### The "Generate from KPIs" Button
- Appears on the KRA Bundles page alongside existing action buttons
- Shows a confirmation dialog explaining what will happen (X templates and Y bundles will be created)
- Calls the database function via RPC
- Shows a success toast with counts
- Skips duplicates -- if a bundle for a department+designation already exists, it will not create a duplicate

### Deduplication Logic
When multiple employees in the same department+designation have the same KRA+KPI, only one template is created. The most common attribute values (target, weightage, thresholds) from the first matching employee are used.

### Safety
- Existing bundles and templates are NOT deleted or modified
- The function checks for existing bundles by department_id + designation to avoid duplicates
- Can be run multiple times safely -- it only creates what is missing

## Risk
Low -- purely additive. No existing data is modified. The function runs in a transaction so it either fully succeeds or fully rolls back.
