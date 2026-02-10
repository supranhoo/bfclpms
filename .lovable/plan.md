

# Per-KPI Frequency Cycle Start Configuration

## Overview
Extend the `frequency_cycle_start` field (already exists on the `kpis` table) to work for **all** multi-month frequencies (Bi-Monthly, Quarterly, Half-Yearly, Yearly), not just Yearly. The global System Settings cycle config becomes the **default**, and each individual KPI can **override** it.

## Bi-Monthly Cycle Options
Currently Bi-Monthly is hardcoded to Jan-Feb, Mar-Apr, etc. We add a second option:

| Option | Cycles |
|--------|--------|
| Standard (Jan start) | Jan-Feb, Mar-Apr, May-Jun, Jul-Aug, Sep-Oct, Nov-Dec |
| Offset (Feb start) | Feb-Mar, Apr-May, Jun-Jul, Aug-Sep, Oct-Nov, Dec-Jan |

## All Cycle Start Values (stored in `frequency_cycle_start`)

| Frequency | Value | Description |
|-----------|-------|-------------|
| Bi-Monthly | `Jan-Feb` (default) | Standard: Jan-Feb, Mar-Apr... |
| Bi-Monthly | `Feb-Mar` | Offset: Feb-Mar, Apr-May... |
| Quarterly | `Jan-Mar` (default) | Standard calendar quarters |
| Quarterly | `Apr-Jun` | Financial year quarters |
| Quarterly | `Jul-Sep` | Mid-year quarters |
| Half-Yearly | `Jan-Jun` (default) | Standard halves |
| Half-Yearly | `Apr-Sep` | Financial year halves |
| Half-Yearly | `Jul-Dec` | Mid-year halves |
| Yearly | `Jan-Dec` (default) | Calendar year |
| Yearly | `Apr-Mar` | Financial year |
| Yearly | `Jul-Jun` | Mid-year |

## Changes

### 1. Add Bi-Monthly to `FrequencyCycleSettings.tsx` (Global Defaults)
- Add `BI_MONTHLY_OPTIONS` array with Standard and Offset options
- Add a new `FrequencyCycleSection` for Bi-Monthly in the settings UI
- Update `frequency_config` table row for Bi-Monthly when saved

### 2. Add Cycle Start Selector to KPI Create Dialog (`AdminKpiCreateDialog.tsx`)
- Add `frequencyCycleStart` state field
- Show a "Cycle Start" dropdown when frequency is Bi-Monthly, Quarterly, Half-Yearly, or Yearly
- Options are fetched from a shared constant (same options as the global settings)
- Default label shows "(Use system default)" as the first/empty option
- Save the selected value to `frequency_cycle_start` column

### 3. Add Cycle Start Selector to KPI Edit Dialog (`AdminKpiEditDialog.tsx`)
- Add `frequency_cycle_start` to formData
- Show same cycle start dropdown when frequency is multi-month
- Pre-populate from existing KPI data

### 4. Update `frequencyUtils.ts` Logic
- Modify `isKpiLockedForPeriod`, `getActiveMonthForCycle`, `getCycleMonths`, `getCycleLabel` to check the per-KPI `frequencyCycleStart` value **first**, then fall back to the database config (global default), then fall back to hardcoded defaults
- Add Bi-Monthly cycle start logic (currently hardcoded to odd/even months)
- Create a helper `getCycleOptionsForFrequency()` that returns the available cycle start values for a given frequency -- shared between admin UI and utils

### 5. Update Import Template (`ImportData.tsx`)
- Update the `frequencyCycleStart` documentation to list all supported values for all frequencies (not just Yearly)
- Update sample rows to show `frequencyCycleStart` usage for Quarterly example (row 2 already has `frequency: 'Quarterly'`)

### 6. Update Import Edge Function (`import-kpis/index.ts`)
- The field `frequency_cycle_start` is already mapped from `frequencyCycleStart` -- no change needed here, it passes through as-is

### 7. Update `FrequencyLockedOverlay.tsx`
- Already passes `frequencyCycleStart` and `config` to utility functions -- will work automatically once the utils are updated

### 8. Create Shared Constants File
- Create `src/lib/frequencyCycleOptions.ts` with all cycle option definitions shared between the settings UI, KPI create/edit dialogs, and utility functions
- This avoids duplicating the option arrays

### 9. Update `DOCUMENTATION.md`
- Document per-KPI cycle start override capability
- Document Bi-Monthly cycle options
- Update import template field reference

## Files to Create
1. `src/lib/frequencyCycleOptions.ts` -- Shared cycle option constants

## Files to Modify
1. `src/components/admin/FrequencyCycleSettings.tsx` -- Add Bi-Monthly section, import shared constants
2. `src/components/admin/AdminKpiCreateDialog.tsx` -- Add cycle start dropdown
3. `src/components/admin/AdminKpiEditDialog.tsx` -- Add cycle start dropdown
4. `src/lib/frequencyUtils.ts` -- Support per-KPI cycle start for all frequencies including Bi-Monthly
5. `src/pages/admin/ImportData.tsx` -- Update docs and sample data
6. `DOCUMENTATION.md` -- Update documentation

## No Database Changes Needed
The `frequency_cycle_start` column already exists on the `kpis` table and accepts any string value. The `frequency_config` table already has all required columns for Bi-Monthly.
