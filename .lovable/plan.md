

# Fix: Normalize Frequency String Mismatch

## Problem

The database contains mismatched frequency strings that bypass all frequency logic:
- **120 KPIs** have `frequency = 'Bimonthly'` (expected: `'Bi-Monthly'`)
- **6 KPIs** have `frequency = 'quarterly'` (expected: `'Quarterly'`)

Because every `switch` statement and `.includes()` check in the codebase uses the exact canonical strings (`'Bi-Monthly'`, `'Quarterly'`), these 126 KPIs are treated as if they have no frequency rules -- no locking, no cycle grouping, no multi-month behavior.

## Two-Part Fix

### Part 1: Database Normalization (Migration)

Run two `UPDATE` statements to fix existing data:

```text
UPDATE kpis SET frequency = 'Bi-Monthly' WHERE frequency = 'Bimonthly';
UPDATE kpis SET frequency = 'Quarterly'  WHERE frequency = 'quarterly';
```

Also normalize the `kpi_templates` table to prevent re-importing bad values:

```text
UPDATE kpi_templates SET frequency = 'Bi-Monthly' WHERE frequency = 'Bimonthly';
UPDATE kpi_templates SET frequency = 'Quarterly'  WHERE frequency = 'quarterly';
```

### Part 2: Code -- Add `normalizeFrequency` Helper

Create a single normalization function in `src/lib/frequencyUtils.ts` that maps common variants to canonical values. Then apply it at key entry points so future mismatches are handled gracefully.

**New function:**

```text
normalizeFrequency(raw) maps:
  'bimonthly' -> 'Bi-Monthly'
  'bi-monthly' -> 'Bi-Monthly'
  'quarterly' -> 'Quarterly'
  'half-yearly' -> 'Half-Yearly'
  'halfyearly' -> 'Half-Yearly'
  'daily' -> 'Daily'
  'weekly' -> 'Weekly'
  'monthly' -> 'Monthly'
  'yearly' -> 'Yearly'
```

**Apply at these entry points (4 files):**

| File | Where | What |
|------|-------|------|
| `src/lib/frequencyUtils.ts` | `isKpiLockedForPeriod`, `getActiveMonthForCycle`, `getCycleMonths`, `getCycleLabel`, `hasMultiMonthCycle`, `requiresSubPeriodSelection` | Normalize the `frequency` parameter at the top of each function |
| `src/lib/frequencyCycleOptions.ts` | `getCycleOptionsForFrequency` | Normalize before the switch |
| `src/hooks/useAdminReports.ts` | `getCalendarMonthsForPeriod` | Normalize the frequency parameter |
| `src/pages/admin/AllKpis.tsx` | Client-side filter | Normalize when comparing frequency |

### Part 3: Also fix the abbreviated month name bug in `getCalendarMonthsForPeriod`

Add a `SHORT_MONTHS` array to correctly resolve "Mar" to index 2, ensuring the active month of a cycle is included in coverage results.

### Part 4: Documentation

Version bump to **1.45.75** with changelog entry.

## Risk Assessment

| Aspect | Detail |
|--------|--------|
| Data impact | 126 KPIs + any matching templates get their frequency string corrected |
| Workflow impact | These KPIs will now correctly follow frequency locking (users may lose the ability to enter data during locked months, which is the intended behavior) |
| Regression risk | Very low -- normalization is additive; existing correct values pass through unchanged |
| Rollback | Simple UPDATE to revert if needed |

