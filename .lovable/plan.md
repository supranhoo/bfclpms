

# Feature: KRA/KPI Name Dropdowns in "Assign New KRA" Dialog

## Overview

Replace the free-text "KRA Name" and "KPI Name" fields in `AdminKpiCreateDialog` with searchable cascading dropdown selectors powered by the existing KPI Templates library.

## Implementation

### File 1: `src/components/admin/AdminKpiCreateDialog.tsx`

**New imports:**
- `useKpiTemplates` from `@/hooks/useKpiTemplates`
- `Popover`, `PopoverContent`, `PopoverTrigger` from UI
- `Command`, `CommandEmpty`, `CommandGroup`, `CommandInput`, `CommandItem`, `CommandList` from UI
- `Check`, `ChevronsUpDown` from `lucide-react`
- `cn` from `@/lib/utils`

**New state:**
- `kraOpen` / `kpiOpen` -- popover open flags
- `isCustomKra` / `isCustomKpi` -- toggles to switch to free-text input mode

**New derived data (useMemo):**
- `filteredKraNames` -- unique KRA names from active templates filtered by `categoryId`
- `filteredKpiTemplates` -- templates filtered by `categoryId` + `kraName`

**New function: `applyTemplate(kpiName)`**
When a KPI is selected from the dropdown, auto-fills: `uomType`, `uom`, `criteria`, `targetValue`, `weightage`, `frequency`, `sourceOfData`, `r5`-`r0`, `qualitativeOptions`, `thresholdMode`, `requireResubmitReason`.

**New effects:**
- Reset KRA/KPI when category changes
- Reset KPI when KRA changes

**UI changes (lines 233-251):**
Replace `<Input>` for KRA Name with a searchable `Popover` + `Command` combobox showing filtered KRA names and a "Custom" option. Replace `<Textarea>` for KPI Name with the same combobox pattern, showing template KPIs with target info. When in custom mode, show the original text input with a "Back" button to return to dropdown mode.

**No changes to `handleSubmit`** -- the same form values flow to `createKpi.mutateAsync()`.

### File 2: `DOCUMENTATION.md`

Add a note in the Admin KPI management section about the cascading dropdown behavior and auto-fill from templates.

## Cascading Flow

```text
Category selected
  --> KRA dropdown shows unique KRA names from templates for that category
    --> KRA selected
      --> KPI dropdown shows KPIs matching category + KRA
        --> KPI selected
          --> All fields auto-fill from template
```

At every level, a "Custom" option allows manual text entry.

## Impact

| Aspect | Detail |
|--------|--------|
| Files changed | 2 |
| Database changes | None |
| Existing KPIs affected | No |
| Workflow changes | None |
| Risk | Low -- additive UI, custom fallback preserved |

