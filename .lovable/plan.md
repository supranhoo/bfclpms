

## RCA: KPI Detail Report Shows Out-of-Workflow Auditor Score

### Root Cause
The KPI Detail Report fetches `auditor_score` directly from `review_submissions` and displays it unconditionally in the "Auditor" column (line 220: `auditorScore: sub?.auditor_score ?? null`). It does not check whether the `audit` stage exists in the employee's month-specific workflow.

For employee 100801 in January 2026, the workflow is `self_l1_hr_pms` (no auditor stage). However, an admin previously entered an auditor score via Admin Data Entry. The report blindly displays this value even though auditor is not part of the workflow.

**Key observation**: The report already fetches per-employee workflow data via `useBulkEmployeeWorkflows` (lines 245-249) but only uses it for orphan detection — not for filtering out-of-workflow scores.

### Fix

**File: `src/pages/reports/KpiDetailReport.tsx`**

In the `enrichedRows` memo (lines 251-260), extend the logic to also blank out score columns for roles not present in the employee's workflow:

```text
Stage-to-score mapping:
  'audit'              → auditorScore = null
  'management_review'  → managementScore = null
  'skip_level_check'   → skipLevelScore = null
  'hr_pms_review'      → hrPmsScore = null
```

When a stage is missing from the employee's workflow stages array, set the corresponding score field to `null` in the enriched row. This also needs to be applied in the Excel export so exported data matches the UI.

The `resolveFinalScore` fallback chain (lines 29-40) is not affected since `final_score` for approved KPIs is already correctly stored in the database (fixed by the earlier migration). For non-approved KPIs, the fallback chain should also respect the workflow — but this is a broader change; for now, blanking the display column is the correct targeted fix.

Also recalculate `totalScore`, `percentage`, and `overallRating` after adjusting the `finalScore` with workflow awareness.

### Files Changed
| File | Action |
|------|--------|
| `src/pages/reports/KpiDetailReport.tsx` | Blank out-of-workflow score columns using existing workflow map |
| `DOCUMENTATION.md` | Version history entry |
| `POLICY.md` | Add invariant: reports must not display scores for non-workflow stages |

### Risk Assessment
- **Data**: No database changes — display-only fix
- **Regression**: Low — only hides scores that shouldn't be visible; in-workflow scores unchanged
- **Scope**: Affects KPI Detail Report only; same pattern should be audited in other reports later

