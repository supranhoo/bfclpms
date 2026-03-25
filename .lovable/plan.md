

## Fix: KpiHeaderSection Not Reflecting Global Frequency Config

### Problem
When you change the global Bi-Monthly cycle setting to "Feb-Mar" in Frequency Cycle Settings, the "View KPI" header still shows "Jan-Feb". This happens because `KpiHeaderSection` calls `getCycleLabel` without passing the global `FrequencyConfig`, so it always falls back to the hardcoded default ("Jan-Feb") when the per-KPI `frequency_cycle_start` is null.

### Root Cause
In `KpiHeaderSection.tsx` line 114:
```tsx
getCycleLabel('Bi-Monthly', selectedPeriod, selectedYear, kpi.frequency_cycle_start)
```
This only passes 4 arguments — the 5th `config` parameter (global frequency config) is missing. Without it, `resolveEffectiveCycleOption` skips the global config lookup and returns the first hardcoded option ("Jan-Feb").

### Fix

**File: `src/components/review/KpiHeaderSection.tsx`**

1. Import `useFrequencyConfig` from `@/hooks/useFrequencyConfig`.
2. Inside the component, call `useFrequencyConfig(kpi.frequency)` to get the global config.
3. Pass the config as the 5th argument to both `getCycleLabel` calls (Bi-Monthly on line 114, Quarterly on line 119):
   ```tsx
   getCycleLabel('Bi-Monthly', selectedPeriod, selectedYear, kpi.frequency_cycle_start, freqConfig)
   getCycleLabel('Quarterly', selectedPeriod, selectedYear, kpi.frequency_cycle_start, freqConfig)
   ```

This ensures the resolution priority works correctly: per-KPI override → global config → hardcoded default.

