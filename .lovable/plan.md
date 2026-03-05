

# Add "Effective Month" Selection Step to KRA Assignment Dialogs

## Problem
All three assignment dialogs (SmartAssignmentDialog, BundleAssignDialog, BulkTemplateAssignDialog) silently derive `review_period` from a non-existent `current_review_period` system setting, defaulting to "January". KPIs get inserted but are invisible in the current month's view.

## Solution
Add an explicit **"Effective Month & Year"** selector to each dialog so the admin consciously picks when the KPIs should land. For multi-month frequencies (Quarterly, Bi-Monthly, etc.), auto-resolve to the terminal month after selection using `getActiveMonthForCycle`.

## Changes

### 1. SmartAssignmentDialog.tsx
- Remove the `currentPeriod`/`currentYear` derivation from `system_settings` (lines 48-60)
- Add `selectedMonth` and `selectedYear` state, defaulting to current calendar month/year (`new Date()`)
- Add a month/year selector row below the dialog description (before tabs): a `<Select>` for month (January-December) and a `<Select>` for year
- Use `selectedMonth`/`selectedYear` in the existing KPI query and insert logic instead of `currentPeriod`/`currentYear`
- Apply `getActiveMonthForCycle` from `src/lib/frequencyUtils.ts` per-template before insert — if a template has a multi-month frequency, resolve `selectedMonth` to its cycle's terminal month

### 2. BundleAssignDialog.tsx
- Same removal of `system_settings` lookup (lines 48-57)
- Add month/year selector in the "select-bundle" step (or as a persistent header)
- Use selected values in insert logic, applying frequency resolution per bundle item

### 3. BulkTemplateAssignDialog.tsx
- Same removal of `system_settings` lookup (lines 45-55 in current code)
- Add month/year selector below the template search area
- Apply frequency resolution before insert

### 4. Documentation sync
- Update `DOCUMENTATION.md` and `POLICY.md` with the new "Effective Month" selection requirement

## UI Design
A compact inline selector row:
```text
Effective Month: [March ▾]  Year: [2026 ▾]
```
Placed prominently near the top of each dialog so the admin sets context before choosing templates/employees. Default: current calendar month and year.

## Risk Assessment
- **Data Impact**: None — only changes how new KPIs are created going forward
- **Regression Risk**: Low — replaces a broken default with explicit user input
- **Workflow Impact**: Adds one selection step but prevents invisible KPI assignments

