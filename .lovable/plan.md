

## Plan: Remove THRESHOLD_TARGET_MISMATCH Detection

### Problem
The `THRESHOLD_TARGET_MISMATCH` check flags R5 = target as a misconfiguration, but the user confirms this is a valid business configuration — placing the target value at R5 is intentional and correct. The current check produces 44 false-positive Medium issues that add noise without value.

### Fix

**File: `src/components/admin/ScoringHealthCheck.tsx`**

Remove the entire `THRESHOLD_TARGET_MISMATCH` detection block (lines 124–198) — the threshold-vs-target sanity check including the `hasValidSpread` suppression logic, `computeRecs`, and both `Higher is Better` / `Lower is Better` issue pushes.

Also remove `'THRESHOLD_TARGET_MISMATCH'` from the `IssueType` union (line 31).

**File: `DOCUMENTATION.md`**

Update version history to v2.13.3: removed THRESHOLD_TARGET_MISMATCH detection — R5 = target is a valid configuration per business rules.

### Files Changed
| File | Change |
|------|--------|
| `src/components/admin/ScoringHealthCheck.tsx` | Remove THRESHOLD_TARGET_MISMATCH type and detection block |
| `DOCUMENTATION.md` | Version history |

### Risk Assessment
- **Regression**: Zero — purely removes a detection that produces false positives
- **Scope**: Reduces issue count; no scoring logic changes

