

## Plan: Add Description-vs-Threshold Mismatch Detection to Scoring Health Check

### Problem
KPI names often embed scoring logic descriptions like "Rating 5: 140%, Rating 4: 120%, Rating 3: 100%..." but the actual configured thresholds may not match these stated percentages. The Health Check currently has no way to catch this data entry inconsistency.

Example from the screenshot: KPI name says "Rating 5: 140%" (implying R5 = 19.6 for target 14), but R5 is configured as 14 (100% of target).

### Fix

**File: `src/components/admin/ScoringHealthCheck.tsx`**

1. Add new issue type `DESCRIPTION_THRESHOLD_MISMATCH` to the `IssueType` union.

2. Add a detection block that:
   - Parses `kpi_name` for patterns like `Rating 5: 140%`, `Rating 4: 120%`, `R5: 140%`, `R5=140%` using regex
   - If percentages are found AND target is defined, computes expected threshold values (e.g., 140% of 14 = 19.6)
   - Compares expected values against actual R5–R1 thresholds
   - Flags mismatches with severity **Medium** when any described percentage differs from the configured value by more than 5% tolerance
   - Shows the specific mismatch: "Description says R5=140% (19.6) but configured R5=14 (100%)"

3. `suggestedFix` shows the computed correct values based on the described percentages:
   ```
   "Based on description: R5=19.6 (140%), R4=16.8 (120%), R3=14 (100%). Update thresholds or correct the description text."
   ```

### Regex Pattern
```typescript
// Matches: "Rating 5: 140%", "R5: 140%", "Rating 5 = 140%", "R5=140"
/(?:Rating\s*|R)([0-5])\s*[:=]\s*(\d+(?:\.\d+)?)\s*%/gi
```

### Detection Logic
```text
1. Extract all "Rating N: X%" pairs from kpi_name
2. If target_value exists and at least one pair found:
   a. For each pair, compute expected = target × (X / 100)
   b. Compare against actual threshold (r5, r4, etc.)
   c. If |expected - actual| > 5% of target → flag mismatch
3. Build suggestedFix showing both described and correct values
```

### Tolerance
A 5% tolerance of target value prevents false positives from rounding differences (e.g., target=14, 140%=19.6 vs configured R5=20 is acceptable).

### Files Changed
| File | Change |
|------|--------|
| `src/components/admin/ScoringHealthCheck.tsx` | Add `DESCRIPTION_THRESHOLD_MISMATCH` type + regex-based detection |
| `DOCUMENTATION.md` | Version history v2.13.4 |

### Risk Assessment
- **Regression**: Zero — additive detection only, no scoring logic changes
- **False positives**: Low — only triggers when kpi_name explicitly contains percentage patterns AND they don't match thresholds
- **Scope**: Numeric KPIs with embedded scoring descriptions only

