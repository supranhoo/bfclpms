

## Plan: Fix DESCRIPTION_THRESHOLD_MISMATCH False Positive for Raw-Percentage KPIs

### Root Cause
The detection at line 145 always computes: `expected = target × (pct / 100)`.

For budget/percentage KPIs where thresholds ARE the raw percentage values (e.g., R3=100 meaning "100% of budget"), the described percentage directly equals the threshold. But the code calculates `95 × (100/100) = 95` and compares against actual `100` → false mismatch.

### Fix

**File: `src/components/admin/ScoringHealthCheck.tsx`** (lines 144-153)

Add a secondary check: if the described percentage value directly matches the actual threshold (within tolerance), treat it as valid and skip the flag.

```typescript
for (const { level, pct } of describedPairs) {
  const expectedFromTarget = target * (pct / 100);
  const actual = thresholdMap[level];
  if (actual !== null && !isNaN(actual)) {
    const directMatch = Math.abs(pct - actual) <= Math.abs(target * 0.05);
    const targetMultiplierMatch = Math.abs(expectedFromTarget - actual) <= Math.abs(target * 0.05);
    if (!directMatch && !targetMultiplierMatch) {
      // Flag mismatch only if NEITHER interpretation matches
      const actualPct = Math.round((actual / target) * 100);
      mismatches.push(`R${level}: description says ${pct}% (${expectedFromTarget.toFixed(1)}) but configured as ${actual} (${actualPct}%)`);
    }
  }
  expectedVals.push(`R${level}=${expectedFromTarget.toFixed(1)} (${pct}%)`);
}
```

**Logic**: Two valid interpretations exist for "Rating 3: 100%":
1. **Target-multiplier**: threshold = target × 100% = 95 (for target=95)
2. **Raw-percentage**: threshold = 100 (the literal value)

If either interpretation matches the actual threshold, suppress the flag.

### Other Files
- `DOCUMENTATION.md`: Version history v2.13.6
- `POLICY.md`: Document dual-interpretation rule

### Risk Assessment
- **Regression**: Zero — relaxes detection (fewer false positives), no scoring logic changes
- **False negatives**: Minimal — only suppresses when described % literally equals the threshold value, which is almost always intentional

