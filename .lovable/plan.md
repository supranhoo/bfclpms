

# Fix: KPI Name Dropdown Not Showing All Available KPIs

## Root Cause

The "Assign New KRA" dialog uses a cascading dropdown that populates KPI names from two sources:
1. **`kpi_templates` table** (the KRA Library)
2. **`kpis` table** (existing assigned KPIs -- fallback)

The current logic is **either/or**: if ANY templates exist for the selected Category + KRA Name combination, it ONLY shows template KPIs. The fallback to existing KPIs never triggers.

For "Statutory Compliance" under the "Compliance" category:
- 10 KPI templates exist in the library
- 60 KPIs exist in actual assignments (many unique ones not in templates)
- The tarpaulin KPI is in `kpis` but NOT in `kpi_templates`, so it never appears

## Fix

Merge both sources instead of using either/or. The KPI Name dropdown should show the **union** of template KPIs and existing assigned KPIs (deduplicated by name).

## Changes

### File: `src/components/admin/AdminKpiCreateDialog.tsx`

**1. `filteredKraNames` (line 113-125)** -- Merge template KRA names with existing KPI KRA names instead of falling back:

```
Before: if templates exist -> return templates ONLY
After:  return union of template names + existing KPI names
```

**2. `filteredKpiTemplates` (line 127-166)** -- Merge template entries with existing KPI entries instead of falling back:

```
Before: if templates match -> return templates ONLY
After:  start with templates, then append unique KPIs from allKpis 
        (skip any whose kpi_name already appears in templates)
```

This also handles the case-sensitivity issue (e.g., "Statutory Compliance" vs "Statutory compliance") since both sources are merged.

### File: `DOCUMENTATION.md`

Update the cascading dropdown documentation to reflect the merged-source behavior.

## Technical Detail

```text
Current flow:
  Category selected
    -> Check kpi_templates for KRA names
    -> IF templates found: show ONLY template KRAs
    -> ELSE: show KRAs from kpis table

Fixed flow:
  Category selected
    -> Collect KRA names from kpi_templates
    -> Collect KRA names from kpis table
    -> Show deduplicated union of both

Same logic applies to KPI Name step.
```

The auto-fill behavior is preserved: when a user selects a KPI that came from a template, all fields (UOM, thresholds, etc.) are auto-filled from the template. When selecting a KPI that came from existing assignments, fields are auto-filled from that existing KPI's data.
