

## Diagnosis: Runtime Error — `getQualitativeTargetLabel is not defined`

### What you're seeing
The KPI detail panel crashes because the browser is running a **stale cached version** of `KpiDetailsTable.tsx`. The error says line 1042, but the current file is only 687 lines — proof the browser hasn't picked up the latest code.

### Why it's happening
The previous edit added the `getQualitativeTargetLabel` usage (line 540) and the import (line 18) in the same change, but Vite's hot-module-reload (HMR) served a partially-updated module where the usage was injected but the import wasn't re-evaluated. This is a transient HMR cache inconsistency — **not a code bug**.

### The code is correct
- `getQualitativeTargetLabel` is properly exported from `src/lib/qualitativeUom.ts` (line 134)
- It is properly imported in `src/components/review/KpiDetailsTable.tsx` (line 18)
- The usage on line 540 matches the function signature

### Fix
A **no-op rebuild trigger** (e.g., adding a blank line or trivial comment to `KpiDetailsTable.tsx`) will force Vite to re-bundle the module with the correct import. This will:

1. Clear the stale HMR cache
2. Resolve the `ReferenceError`
3. Make Target show the Rating-5 label (e.g., "No" for LTI) instead of "N/A"
4. Make Achieved show the qualitative label instead of raw numbers

No logic changes needed — just a rebuild trigger.

