

# Feature: Copy KRAs from Employee A to Employee B

## Overview

Add a "Copy KRAs" action on the All KPIs page that lets an admin select a source employee, pick which KRAs to copy, and assign them to one or more target employees -- all within a single dialog. No new database tables, edge functions, or RLS policies are needed since it reuses the existing `kpis` INSERT path that Smart Assignment and Bulk Assign already use.

## User Experience

1. Admin navigates to **All KPIs** page and clicks a new **"Copy KRAs"** button in the header toolbar (next to existing "Assign New KRA" and "Smart Assign" buttons).
2. A dialog opens with three steps:

```text
+------------------------------------------------------+
|  Copy KRAs                                           |
|------------------------------------------------------|
|  Step 1: Source                                      |
|  [Search Employee A ▾]  [Period ▾]  [Year ▾]        |
|                                                      |
|  Step 2: Select KRAs (auto-loaded)                   |
|  [x] Sales > Monthly Revenue Target  (Wt: 15%)      |
|  [x] Operations > Defect Rate        (Wt: 10%)      |
|  [ ] HR > Attrition Control          (Wt: 5%)       |
|  [Select All / Deselect All]                         |
|                                                      |
|  Step 3: Target Employee(s)                          |
|  [Search Employee B ▾]  (multi-select)               |
|  Target Period: [February ▾]  Year: [2026 ▾]        |
|                                                      |
|  [!] 2 duplicate KRAs will be skipped for Emp B      |
|                                                      |
|              [Cancel]  [Copy X KRAs]                 |
+------------------------------------------------------+
```

3. On confirm, the selected KRAs are inserted as new `kpis` rows for each target employee with `status: 'kra_set'`, copying all fields (target, weightage, UOM, thresholds, frequency, etc.) -- identical to the `buildNewKpi` pattern already used by rollover.
4. A toast confirms "Copied 5 KRAs to 2 employees".

## Why This Approach

| Consideration | Decision |
|---|---|
| **Infrastructure** | Zero new tables, functions, or migrations. Reuses the existing `kpis` table INSERT with the same fields rollover and Smart Assign use. |
| **RLS Policies** | No changes. Admin role already has full INSERT/SELECT on `kpis`. |
| **Duplicate safety** | Before inserting, the dialog fetches target employee's existing KPIs for that period and flags duplicates (same `kra_name + kpi_name` composite key), skipping them automatically with a visible warning. |
| **Flexibility** | Admin can copy to multiple employees at once, change the target period/year, and cherry-pick individual KRAs. |

## Technical Details

### New File: `src/components/admin/CopyKrasDialog.tsx`

- Props: `isOpen`, `onClose`
- Uses existing hooks: `useProfiles()`, `useAllKpis()`, `useSystemSettings()`, `useKraCategories()`
- Source employee selector: searchable combobox filtered by period/year
- KRA checklist: loaded from `kpis` table filtered by `employee_id + review_period + review_year`
- Target employee(s): multi-select combobox (excludes source employee)
- Duplicate detection: fetches target employees' KPIs for the target period and compares `kra_name|||kpi_name` keys (same pattern as rollover)
- Insert mutation: `supabase.from('kpis').insert(kpisToInsert)` with invalidation of `['all-kpis']` query key

### Modified File: `src/pages/admin/AllKpis.tsx`

- Add `CopyKrasDialog` import and state toggle
- Add a "Copy KRAs" button with `Copy` icon in the header action bar

### Modified File: `DOCUMENTATION.md`

- Document the Copy KRAs feature under the Admin section

## Fields Copied (mirrors rollover `buildNewKpi`)

`category_id`, `kra_name`, `kpi_name`, `target_value`, `uom`, `uom_type`, `weightage`, `frequency`, `sub_frequency`, `criteria`, `source_of_data`, `r5-r0`, `threshold_mode`, `qualitative_options`, `is_org_level`, `org_level_scope`, `ref_code`, `day_count_type`, `frequency_cycle_start`, `require_resubmit_reason`

New values: `employee_id` = target, `review_period` / `review_year` = target period, `status` = `'kra_set'`

