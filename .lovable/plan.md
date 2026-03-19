

## Root Cause Analysis: Stale `final_score` Persisting After Auditor/Management Scored 0

### Evidence from Live Data

For KPI `1f220ea1` (January 2026, "Maintining and Reconciling inventory"):
- `self_score: 5, self_rating: "blue"`
- `auditor_score: 0, auditor_rating: "red"`
- `management_score: 0, management_rating: "red"`
- `final_score: 5, final_rating: "blue"` ← **WRONG — should be 0**
- Status: Approved

Multiple KPIs show this pattern: Self=5, Auditor=0, Mgmt=0, but Final=5.

---

### Root Causes Identified

**RC-1: Legacy imported data was never corrected**

These KPIs were bulk-imported (via `import-kpis` edge function) with `final_score` set from self-review before our fix. The old import code was:
```
final_score: row.auditRating ?? row.managerRating ?? row.employeeRating ?? row.rating ?? null
```
With only self-rating available at import time, `final_score=5` was written. The KPIs were then reviewed through the UI, but **the old code paths did not clear the stale `final_score` during intermediate stages**. Our fix (clearing `final_score` in the `else` branch) was applied AFTER these KPIs were already processed.

**RC-2: `getRelevantScore()` in UnifiedScorecard still uses `final_score` unconditionally (ACTIVE BUG)**

Lines 454-459 of `UnifiedScorecard.tsx`:
```typescript
const getRelevantScore = (submission: any) => {
  if (submission.final_score !== null && submission.final_score !== undefined) {
    return submission.final_score; // ← No status check!
  }
  // ...fallback chain
};
```
This function powers the **Overall Score chart and Category Score chart** on the dashboard. It picks up stale `final_score=5` for ALL KPIs regardless of status, inflating dashboard scores.

**RC-3: ManagementScorecard ALWAYS writes `final_score` regardless of approve flag**

Lines 304-305 of `ManagementScorecard.tsx`:
```typescript
final_rating: management_rating,
final_score: management_score,  // ← Written on EVERY submit, not just approval
```
This is inconsistent with the UnifiedScorecard pattern (which only writes on approval and clears otherwise). While it correctly writes the management score, it means non-approved saves pollute the `final_score` field.

---

### CAPA Plan (4 Fixes)

**Fix 1: Data migration — Correct stale `final_score` for approved KPIs**

Write a one-time SQL migration that recalculates `final_score` for all approved KPIs using the proper fallback chain:
```sql
UPDATE review_submissions rs
SET 
  final_score = COALESCE(rs.management_score, rs.auditor_score, rs.hr_pms_score, 
                          rs.skip_level_score, rs.manager_score, rs.self_score),
  final_rating = COALESCE(rs.management_rating, rs.auditor_rating, rs.hr_pms_rating,
                           rs.skip_level_rating, rs.manager_rating, rs.self_rating)
FROM kpis k
WHERE k.id = rs.kpi_id
  AND k.status = 'approved'
  AND rs.is_na = false
  AND rs.final_score IS DISTINCT FROM 
      COALESCE(rs.management_score, rs.auditor_score, rs.hr_pms_score,
               rs.skip_level_score, rs.manager_score, rs.self_score);
```
Also NULL out `final_score`/`final_rating` for non-approved KPIs that still have stale values.

**Fix 2: Gate `getRelevantScore()` in UnifiedScorecard**

Update lines 454-469 to check KPI status before using `final_score`. The function needs the KPI's status passed in:
```typescript
const getRelevantScore = (submission: any, kpiStatus?: string) => {
  if (!submission) return 0;
  if (kpiStatus === 'approved' && submission.final_score != null) {
    return submission.final_score;
  }
  // ...existing fallback chain
};
```

**Fix 3: Align ManagementScorecard with the guarded pattern**

Change lines 296-308 to only set `final_score`/`final_rating` when `approve === true`:
```typescript
const updatePayload: any = {
  management_rating, management_score, management_remarks,
  management_evidence_url, management_achieved_value,
};
if (approve) {
  updatePayload.final_rating = management_rating;
  updatePayload.final_score = management_score;
} else {
  updatePayload.final_score = null;
  updatePayload.final_rating = null;
}
```

**Fix 4: Clear stale `final_score` for non-approved KPIs (migration)**

```sql
UPDATE review_submissions rs
SET final_score = NULL, final_rating = NULL
FROM kpis k
WHERE k.id = rs.kpi_id
  AND k.status != 'approved'
  AND (rs.final_score IS NOT NULL OR rs.final_rating IS NOT NULL);
```

---

### Files to Change

| File | Change |
|------|--------|
| New migration SQL | Fix 1 + Fix 4: Correct stale final_scores in DB |
| `src/components/review/UnifiedScorecard.tsx` | Fix 2: Gate `getRelevantScore()` with status check |
| `src/components/review/ManagementScorecard.tsx` | Fix 3: Only write final_score on approval |

### Impact
- Immediately corrects all existing stale scores in the database
- Dashboard charts (Overall Score, Category Score) will show accurate values
- Prevents future stale values from all code paths (UnifiedScorecard, ManagementScorecard, import, admin data entry)

