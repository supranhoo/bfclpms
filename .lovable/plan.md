

## RCA & Fix: Admin Management Score Not Updating final_score on Already-Approved KPIs

### Root Cause

**File: `src/hooks/useAdminDataEntry.ts` lines 198-201**

When the admin enters a management score on a KPI that is **already approved**, the code explicitly skips final_score sync:

```typescript
if (currentKpiStatus === 'approved') {
  console.info('KPI already approved — skipping status advancement and final_score sync');
  newStatus = null;  // ← This prevents line 232 from running
}
```

Line 232 only updates `final_score` when `newStatus === 'approved'`, but since it's already approved, `newStatus` is `null`. Result: `management_score` gets set to 5, but `final_score` stays at 0 (the old auditor score).

**DB evidence**: KPI `a93a5c95` (Budgetary Preparation, Abhas, Jan 2026):
- `management_score = 5`, `auditor_score = 0`, `final_score = 0` ← should be 5

### Fix

**File: `src/hooks/useAdminDataEntry.ts`**

After the upsert (around line 280), add a new block: **when the KPI is already approved**, recompute `final_score` using the 8-stage fallback chain from the freshly-written submission data, then patch it. This ensures any admin edit on an approved KPI immediately reflects in the dashboard.

```typescript
// After upsert succeeds, if KPI was already approved, recompute final_score
if (currentKpiStatus === 'approved' && newSubmission) {
  const fallbackChain = [
    'management_score', 'auditor_score', 'hr_pms_score',
    'skip_level_score', 'manager_score', 'self_score'
  ];
  let computedScore = null;
  for (const field of fallbackChain) {
    if (newSubmission[field] !== null && newSubmission[field] !== undefined) {
      computedScore = newSubmission[field];
      break;
    }
  }
  if (computedScore !== null) {
    await supabase.from('review_submissions')
      .update({ final_score: computedScore })
      .eq('kpi_id', kpi_id);
  }
}
```

Also fix the **existing data** for this specific KPI with a one-time DB patch.

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useAdminDataEntry.ts` | Add post-upsert final_score recomputation for already-approved KPIs |
| DB migration | Fix existing stale final_score for affected KPI |
| `DOCUMENTATION.md` | v2.15.5 changelog |
| `POLICY.md` | Add invariant: admin edits on approved KPIs must recompute final_score |

### Risk Assessment
- **Regression**: Low — only triggers for already-approved KPIs edited by admin
- **Data**: One-time patch corrects the specific KPI; trigger ensures rating stays in sync
- **Performance**: Single additional query only when editing approved KPIs

