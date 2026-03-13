

# Fix: False Positive MISSING_TARGET in Scoring Health Check

## Problem

The Health Check flags ALL numeric KPIs with `target_value == null` as "Missing Target", even when they have R5-R1 thresholds defined in absolute mode. These KPIs score correctly without a target — the engine compares the achieved value directly against thresholds.

Example: "Ensure raw material inventories between min-max levels" measures deviation count. R5=0 (no deviations), R1=4 (four deviations). No target needed — the thresholds ARE the scoring logic.

## Fix

**`src/components/admin/ScoringHealthCheck.tsx`** — Refine the `MISSING_TARGET` detection (around line 99):

Only flag `MISSING_TARGET` when the KPI has **no thresholds defined either**. If R5-R1 thresholds exist, the target is not required for scoring.

```typescript
// Before:
if (kpi.target_value == null) {
  issues.push({ ... type: 'MISSING_TARGET' ... });
}

// After:
if (kpi.target_value == null && !hasAnyThreshold) {
  issues.push({ ... type: 'MISSING_TARGET' ... });
}
```

This moves the `MISSING_TARGET` check inside the `!hasAnyThreshold` block (or adds the `&& !hasAnyThreshold` guard), so KPIs with defined thresholds are no longer falsely flagged.

## Impact
- Eliminates false positives for threshold-based KPIs (like deviation counts, error counts, etc.)
- Only flags KPIs that truly have no scoring mechanism (no target AND no thresholds)
- Single-line change in one file

