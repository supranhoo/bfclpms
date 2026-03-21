

## Fix HR PMS "Pending Review" Tile Count (Stats Computation)

### Root Cause
The previous fix only corrected the **employee list filter** logic (line ~466) to use `resolveReviewableStatuses`. However, the **stats tile computation** (line 606-620) was never updated — it still counts all KPIs at any stage before `hr_pms_review` (excluding `kra_set`) as "pending", which includes `self_review`, `manager_check`, `skip_level_check`. This gives the inflated count of 125.

The correct "Pending Review" for HR PMS should only count KPIs at the stage **immediately before** `hr_pms_review` in each employee's workflow — i.e., using `resolveReviewableStatuses('hr_pms', stages)` minus `hr_pms_review` itself.

### Fix

**Modified: `src/components/review/EmployeeSelectorGrid.tsx`** (lines 606-620)

Replace the broad `beforeHr` stage matching with `resolveReviewableStatuses`:

```typescript
} else if (viewLevel === 'hr_pms') {
  let pending = 0, inReview = 0, forwarded = 0;
  relevantKpis.forEach(k => {
    const stages = getStages(k.employee_id);
    const hrIdx = stages.indexOf('hr_pms_review');
    if (hrIdx === -1) return;
    if (k.status === 'hr_pms_review') inReview++;
    else {
      // Use resolveReviewableStatuses — only count KPIs at the stage
      // immediately before hr_pms_review, NOT all earlier stages
      const hrReviewable = resolveReviewableStatuses('hr_pms', stages);
      if (hrReviewable.includes(k.status || '') && k.status !== 'hr_pms_review') {
        pending++;
      }
      const afterHr = stages.slice(hrIdx + 1);
      if (afterHr.includes(k.status || '')) forwarded++;
    }
  });
  return { ... };
}
```

This aligns the tile count with the employee list filter, which was already fixed. For Feb, this should show 0 pending (since all 125 KPIs are at `self_review`/`manager_check`/`skip_level_check`, not at the stage immediately before HR PMS).

### Single file change. No database changes.

