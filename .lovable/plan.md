

## RCA: Weighted Score 450/450 Despite Lower Skip-Level Scores (Employee 100360)

### Root Cause

The user is viewing employee 100360 from `view=team`, which maps to `viewLevel = 'manager'` in Dashboard.tsx (line 343). The `getRelevantScore` function (line 498-499) for manager viewLevel is:

```typescript
return submission.manager_score ?? submission.self_score ?? 0;
```

The manager scored all KPIs as **5** — so weighted score = 5 × 90 = 450/450. **Skip-level scores (2, 3, 5, etc.) are completely ignored** in the manager view's calculation.

The previous fix (v2.17.1) only addressed `viewLevel === 'self'` to use the full fallback chain. All other viewLevels still use truncated chains:

| viewLevel | Current chain | Missing stages |
|-----------|--------------|----------------|
| `self` | Full 8-stage ✓ | None |
| `manager` | manager → self | skip_level, hr_pms, auditor, management |
| `auditor` | auditor → manager → self | skip_level, hr_pms, management |
| `else` (hr_pms, skip_level, management) | management → auditor → manager → self | skip_level, hr_pms |

This is a **policy gap introduced across multiple iterations**: the 8-stage fallback chain was documented as the authoritative scoring method, but only applied to `self` view. Every other viewLevel still uses its legacy truncated chain.

### Impact

When any reviewer views a subordinate's scorecard, they see the **reviewer's own scores** rather than the **most advanced assessment**. This is misleading because:
- A manager sees 100% (their score) even though skip-level rated much lower
- HR PMS reviewer sees their own scores, not auditor corrections
- The weighted score contradicts what the KPI Details table shows (which displays all columns)

### Fix

Apply the same 8-stage fallback chain to ALL viewLevels in `getRelevantScore`. Every viewer should see the most current assessment of the employee — not a frozen snapshot from their own review stage.

```typescript
const getRelevantScore = (submission: any, kpiStatus?: string) => {
  if (!submission) return 0;
  if (kpiStatus === 'approved' && submission.final_score != null) {
    return submission.final_score;
  }
  // Universal 8-stage fallback for all view levels
  return submission.management_score 
    ?? submission.auditor_score 
    ?? submission.hr_pms_score 
    ?? submission.skip_level_score 
    ?? submission.manager_score 
    ?? submission.self_score 
    ?? 0;
};
```

### Files to Change

| File | Change |
|------|--------|
| `src/components/review/UnifiedScorecard.tsx` | Replace per-viewLevel score branches with universal 8-stage fallback chain |
| `DOCUMENTATION.md` | Version bump, document universal fallback policy |

### Risk Assessment
- **Data Impact**: None — display-only change
- **Workflow Impact**: None — no status transitions affected
- **Regression Risk**: Low — aligns all views with the documented authoritative scoring method
- **UI Impact**: Reviewers will see updated (potentially lower) weighted scores that reflect downstream reviewer corrections. This is the correct behavior per the 8-stage fallback chain policy.

