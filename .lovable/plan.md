

## Plan: Add Threshold-vs-Target Sanity Check to Scoring Health Check

### Problem
The Scoring Health Check only validates structural issues (inverted, missing) for numeric KPIs. It does NOT detect **logically suspicious thresholds** — like R5 equaling the target when the scoring logic description says R5 should be 140% of target.

For the Green Belt Enhancement KPI: Target=14, R5=14 (should be ~19.6 per "Rating 5: 140%"). Any achieved value ≥14 gets Rating 5, making the threshold meaningless.

### Current Detection Coverage
- **Binary KPIs**: 4 checks (missing polarity, invalid ratings, likely inverted, missing options)
- **Tiered KPIs**: 1 check (missing options)
- **Numeric KPIs**: 4 checks (inverted criteria, missing thresholds, missing target, missing criteria)
- **Missing**: No threshold-vs-target reasonableness check for any UOM type

### Fix: Add New Issue Type `THRESHOLD_TARGET_MISMATCH`

**File: `src/components/admin/ScoringHealthCheck.tsx`**

1. Add new `IssueType`: `'THRESHOLD_TARGET_MISMATCH'`

2. In `detectIssues`, after the existing numeric checks (around line 103), add:

```text
For "Higher is Better" numeric KPIs with a target:
  - If R5 <= target → flag as Medium severity
    "R5 threshold (14) is ≤ the target (14). Any value meeting the target 
     gets the highest rating. Verify thresholds are absolute values, 
     not percentages."

For "Lower is Better" numeric KPIs with a target:
  - If R5 >= target → flag as Medium severity
    "R5 threshold (X) is ≥ the target (Y). Any value meeting the target 
     gets the highest rating."
```

3. This check also catches cases where ALL thresholds are below the target (common misconfiguration where someone enters percentage multipliers like 140,120,100 as the threshold when mode is absolute).

4. The issue is flagged as **Medium** severity (non-auto-fixable, informational) with an Eye icon for impact preview and Pencil icon to open editor — same as existing medium issues.

### Files Changed
| File | Change |
|------|--------|
| `src/components/admin/ScoringHealthCheck.tsx` | Add `THRESHOLD_TARGET_MISMATCH` detection for numeric KPIs |
| `DOCUMENTATION.md` | Version history |

### Risk Assessment
- **Regression**: Zero — additive detection only, no scoring logic changes
- **False positives**: Possible for KPIs where R5 intentionally equals target (e.g., "meet target = outstanding"). Flagged as Medium/informational, not auto-fixed.
- **Scope**: All numeric KPIs with both target and thresholds defined

