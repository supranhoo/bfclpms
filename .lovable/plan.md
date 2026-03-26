

## Show Positive Variance in Green on Variance Report

### Change
Currently, variance is stored as `Math.abs(auditorScore - managementScore)` and always displayed with a red/grey badge. The user wants **positive variance** (Auditor > Management) in **green** and negative variance (Management > Auditor) in **red**.

### Implementation

**File: `src/pages/reports/VarianceReport.tsx`**

1. **Store signed variance** — Change `variance: Math.abs(...)` to `variance: auditorScore - managementScore` (line 96)
2. **Sort by absolute value** — Update sort to `Math.abs(b.variance) - Math.abs(a.variance)` (line 100)
3. **Update summary cards** — Use `Math.abs()` for avg/max calculations since they reference `r.variance` directly
4. **Color the badge** — Replace the single badge logic (line 284) with:
   - Green badge (`bg-green-100 text-green-800`) when variance > 0 (Auditor scored higher)
   - Red/destructive badge when variance < 0 (Management scored higher)
   - Show absolute value with a +/- prefix
5. **Update Excel export** — Show signed variance in the export as well

### Risk Assessment
- **Data Impact**: None — display-only change
- **Regression Risk**: Zero — cosmetic update to one report

### Files Changed
1. `src/pages/reports/VarianceReport.tsx` — Signed variance + green/red badge coloring

