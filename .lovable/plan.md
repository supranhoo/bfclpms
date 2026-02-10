

# Add Frequency Cycle Configuration UI

## Overview
Add an admin UI under System Settings to allow configuring frequency cycle options for Quarterly, Half-Yearly, and Yearly frequencies. This will let admins choose alternative cycle starts (e.g., Apr-Jun quarters instead of Jan-Mar) and update the locked months accordingly.

## Current State
- The `frequency_config` table stores cycle definitions with `locked_months`, `active_month`, and `sub_frequency` per frequency type
- Currently only **Yearly** supports multiple cycle starts via `frequencyCycleStart` in the import template
- **Quarterly** is hardcoded to Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec
- **Half-Yearly** is hardcoded to Jan-Jun, Jul-Dec
- **Bi-Monthly** is hardcoded to Jan-Feb, Mar-Apr, etc.
- There is **no UI** to change these -- only direct database edits

## What Will Be Built

### New "Frequency Cycles" tab in System Settings
A new tab (between "Scoring" and "Controls") showing editable cycle configurations for each multi-month frequency:

```text
+--------------------------------------------------+
| Frequency Cycles                                   |
+--------------------------------------------------+
|                                                    |
| Quarterly Cycle Start                              |
| (o) Standard: Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec  |
| ( ) Financial: Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar  |
| ( ) Mid-Year: Jul-Sep, Oct-Dec, Jan-Mar, Apr-Jun   |
|                                          [Save]    |
|                                                    |
| Half-Yearly Cycle Start                            |
| (o) Standard: Jan-Jun, Jul-Dec                     |
| ( ) Financial: Apr-Sep, Oct-Mar                    |
| ( ) Mid-Year: Jul-Dec, Jan-Jun                     |
|                                          [Save]    |
|                                                    |
| Yearly Cycle Start                                 |
| (o) Calendar Year: Jan-Dec                         |
| ( ) Financial Year: Apr-Mar                        |
| ( ) Mid-Year: Jul-Jun                              |
|                                          [Save]    |
+--------------------------------------------------+
```

### Cycle option definitions

**Quarterly** options:
| Option | Cycles | Locked Months | Active Months |
|--------|--------|---------------|---------------|
| Standard (Jan) | Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec | [1,2], [4,5], [7,8], [10,11] | 3, 6, 9, 12 |
| Financial (Apr) | Q1: Apr-Jun, Q2: Jul-Sep, Q3: Oct-Dec, Q4: Jan-Mar | [4,5], [7,8], [10,11], [1,2] | 6, 9, 12, 3 |
| Mid-Year (Jul) | Q1: Jul-Sep, Q2: Oct-Dec, Q3: Jan-Mar, Q4: Apr-Jun | [7,8], [10,11], [1,2], [4,5] | 9, 12, 3, 6 |

**Half-Yearly** options:
| Option | Cycles | Locked Months | Active Months |
|--------|--------|---------------|---------------|
| Standard (Jan) | H1: Jan-Jun, H2: Jul-Dec | [1,2,3,4,5], [7,8,9,10,11] | 6, 12 |
| Financial (Apr) | H1: Apr-Sep, H2: Oct-Mar | [4,5,6,7,8], [10,11,12,1,2] | 9, 3 |
| Mid-Year (Jul) | H1: Jul-Dec, H2: Jan-Jun | [7,8,9,10,11], [1,2,3,4,5] | 12, 6 |

**Yearly** options (already partially supported):
| Option | Cycle | Locked Months | Active Month |
|--------|-------|---------------|--------------|
| Jan-Dec | Jan-Dec | [1-11] | 12 |
| Apr-Mar | Apr-Mar | [4-2 wrapping] | 3 |
| Jul-Jun | Jul-Jun | [7-5 wrapping] | 6 |

### How saving works
When an admin selects a new cycle option and clicks Save:
1. Update the `frequency_config` row for that frequency with new `locked_months`, `active_month`, and `sub_frequency` values
2. Update the `frequencyUtils.ts` logic to read from the database config instead of hardcoded values
3. The `useFrequencyConfig` hook already fetches this data -- the locking logic just needs to use it

## Technical Details

### Files to Create
1. **`src/components/admin/FrequencyCycleSettings.tsx`** -- New component with radio groups for each frequency's cycle options. Uses `useFrequencyConfigs()` to read current config and a mutation to update `frequency_config` rows.

### Files to Modify
1. **`src/pages/admin/SystemSettings.tsx`** -- Add a new "Cycles" tab with the `FrequencyCycleSettings` component. Update the TabsList from 7 to 8 columns.

2. **`src/lib/frequencyUtils.ts`** -- Update `isKpiLockedForPeriod`, `getActiveMonthForCycle`, `getCycleMonths`, and `getCycleLabel` to accept an optional `FrequencyConfig` parameter. When provided, use the database-driven `locked_months` and `active_month` instead of hardcoded switch statements. Keep hardcoded values as fallback defaults.

3. **`src/hooks/useFrequencyConfig.ts`** -- Add an `useUpdateFrequencyConfig` mutation hook for saving cycle changes.

4. **`src/components/review/FrequencyLockedOverlay.tsx`** -- Pass the frequency config from the hook into the utility functions so locking respects the configured cycle.

5. **`DOCUMENTATION.md`** -- Document the new Frequency Cycle configuration feature.

### Database Changes
No schema changes needed -- the existing `frequency_config` table already has all the required columns (`locked_months`, `active_month`, `sub_frequency`). We just need to update the row values via the existing Supabase client.

