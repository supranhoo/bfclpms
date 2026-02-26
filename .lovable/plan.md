
# RCA & CAPA: Org KPI Value and Rating Not Reflecting in Reviewer Views

## Root Cause Analysis (RCA)

### Issue Summary
After updating Organization KPI data and propagating, the **remark** appears correctly in the scorecard, but the **achieved value** and **rating/score** are not reflecting properly in certain views.

### Root Causes Identified

#### RC-1: Desktop KPI Table Missing Org KPI Value Prop (HIGH)
In `UnifiedScorecard.tsx` (line 1133-1148), the desktop `KpiDetailsTable` is rendered **without** the `getOrgKpiValue` prop. However, the mobile `MobileKpiCard` (line 1118) correctly receives it. This means:
- Desktop users cannot see org KPI achieved values in the table
- The org KPI badge and value display in the table row is broken on desktop

```text
Mobile view (correct):     <MobileKpiCard getOrgKpiValue={getOrgKpiValue} ... />
Desktop view (MISSING):    <KpiDetailsTable ... />  <-- no getOrgKpiValue prop
```

#### RC-2: Reviewer Score Initialization Ignores Org KPI Data (MEDIUM)
When a reviewer (Manager, Auditor, HR PMS, etc.) opens the review sheet via `openReviewSheet()` (line 638-667), the `reviewerAchievedValue` is initialized only from:
1. `submission.[prefix]_achieved_value` (reviewer's own achieved value)
2. `submission.achieved_value` (self-level achieved value)

It does **not** fall back to the latest `org_kpi_values` data. If the org value was recently updated but not yet re-propagated, the reviewer sees stale data. The `SelfReviewSheet` correctly prefills from org data (line 246-247), but the reviewer sheet does not.

#### RC-3: Reviewer Score Cascade Missing Org KPI Prefill (MEDIUM)  
When a manager hasn't scored yet (`manager_score` is null), `openReviewSheet` sets `reviewerScore = null`. For org KPIs, it should inherit the self_score (which was set by propagation) so the reviewer sees the propagated rating and can approve or override it.

### Data Verification
Database query confirmed the propagation RPC correctly writes `achieved_value`, `self_score`, `self_rating`, and `self_remarks` to `review_submissions`. The specific KPI in the screenshot has:
- `org_kpi_values.achieved_value = 5`, `remarks = "Zero Fatal"`, `status = "propagated"`
- `review_submissions.achieved_value = 5`, `self_score = 0`, `self_remarks = "Zero Fatal"`

Both are in sync, confirming propagation works. The issue is the **display layer** not reading the data correctly.

---

## CAPA (Corrective and Preventive Actions)

### Fix 1: Pass `getOrgKpiValue` to Desktop KpiDetailsTable
**File:** `src/components/review/UnifiedScorecard.tsx` (line ~1133)

Add the missing `getOrgKpiValue` prop to the desktop `KpiDetailsTable` component, matching the mobile view. This ensures org KPI values are visible in the table for all reviewer views on desktop.

### Fix 2: Prefill Reviewer Achieved Value from Org KPI Data
**File:** `src/components/review/UnifiedScorecard.tsx` (function `openReviewSheet`, line ~663)

After falling back to `submission.achieved_value`, add a final fallback to `getOrgKpiValue(kpi)?.achieved_value` for org-level KPIs. This ensures reviewers see the latest org data even if the submission field is empty.

```text
Current chain:  prefix_achieved_value -> achieved_value -> null
Fixed chain:    prefix_achieved_value -> achieved_value -> orgKpiValue -> null
```

### Fix 3: Prefill Reviewer Score from Previous Level for Org KPIs
**File:** `src/components/review/UnifiedScorecard.tsx` (function `openReviewSheet`, line ~651)

Update the `scoreFieldMap` fallback logic so that when a reviewer hasn't scored yet, they inherit the **previous level's score**. For manager: fall back to `self_score`. This ensures the propagated rating is visible to the reviewer immediately upon opening.

```text
Current:  manager: () => existing?.manager_score ?? null
Fixed:    manager: () => existing?.manager_score ?? existing?.self_score ?? null
```

Wait -- looking at this more carefully, the manager scoreFieldMap already has the correct pattern for other levels (e.g., `skip_level` falls back to `manager_score`). The `manager` case is the only one that doesn't fall back to `self_score`. This was intentional to avoid pre-filling the manager's score with the employee's self-assessment. However, for **org-level KPIs** where the self_score is system-calculated (not employee-entered), inheriting it makes sense.

**Refined Fix 3:** Only prefill from self_score for org-level KPIs:
```text
manager: () => existing?.manager_score ?? (kpi.is_org_level ? existing?.self_score ?? null : null)
```

### Summary of Changes

| File | Change | Risk |
|------|--------|------|
| `UnifiedScorecard.tsx` | Pass `getOrgKpiValue` to desktop `KpiDetailsTable` | None - additive prop |
| `UnifiedScorecard.tsx` | Prefill `reviewerAchievedValue` from org data | Low - only for org KPIs |
| `UnifiedScorecard.tsx` | Prefill `reviewerScore` from self_score for org KPIs | Low - manager can still override |

All changes are in a single file and are display-layer only. No schema, RLS, or propagation logic changes needed.
