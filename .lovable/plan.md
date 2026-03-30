

## Plan: Smart Threshold Recommendations in Scoring Health Check

### Problem
The current `THRESHOLD_TARGET_MISMATCH` detection shows 541 generic "verify this is intentional" messages. Admins cannot act on them without manually calculating what the thresholds should be. The system has enough data (target, criteria, UOM) to compute and recommend specific R5–R1 values.

### Fix

**File: `src/components/admin/ScoringHealthCheck.tsx`**

Replace the generic `suggestedFix` text with computed threshold recommendations based on criteria and UOM:

#### Recommendation Logic

**Higher is Better** (target = T):
```text
Recommended: R5 = T×1.20, R4 = T×1.10, R3 = T, R2 = T×0.90, R1 = T×0.80
```
Example: Target = 15 → R5=18, R4=16.5, R3=15, R2=13.5, R1=12

**Lower is Better** (target = T):
```text
Recommended: R5 = T×0.80, R4 = T×0.90, R3 = T, R2 = T×1.10, R1 = T×1.20
```
Example: Target = 95% → R5=76, R4=85.5, R3=95, R2=104.5, R1=114

**Date UOM** (target = T days):
```text
R5 = T-3, R4 = T-1, R3 = T, R2 = T+2, R1 = T+5
```

#### Display Format
The `suggestedFix` field will show:
```
Suggested thresholds: R5=18, R4=16.5, R3=15, R2=13.5, R1=12.
Open KPI editor to apply.
```

#### Suppression Refinement
Additionally, suppress the flag entirely when R5 = target AND all other thresholds (R4–R1) form a valid spread away from target. This indicates intentional "meet target = R5" configuration with proper degradation — not a misconfiguration.

### Files Changed
| File | Change |
|------|--------|
| `src/components/admin/ScoringHealthCheck.tsx` | Compute specific R5–R1 recommendations based on target, criteria, UOM |
| `DOCUMENTATION.md` | Version history |

### Risk Assessment
- **Regression**: Zero — display-only change in suggestion text
- **False positives reduced**: Suppresses flags where R4–R1 already form a valid spread
- **Scope**: Affects `suggestedFix` string only; no scoring logic changes

