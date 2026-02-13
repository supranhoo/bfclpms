
# RCA and CAPA: "Review" Button Missing for Skip-Level and HR PMS in KPI Details Table

## Root Cause Analysis

The bug is on **line 685** of `src/components/review/UnifiedScorecard.tsx`:

```
const viewType = viewLevel === 'manager' ? 'team-review'
               : viewLevel === 'auditor' ? 'audit'
               : 'management';
```

When `viewLevel` is `skip_level` or `hr_pms`, this ternary chain falls through to `'management'`. The workflow engine's `canReviewKpi('manager_check', 'management', ...)` returns `false` because management only reviews KPIs at `management_review` status. This causes the "Review" button to never appear, and the fallback "View" button is shown instead.

Additionally, the `KpiTableViewType` in `KpiDetailsTable.tsx` only defines four values: `'my-kpis' | 'team-review' | 'audit' | 'management'`. It is missing `'skip-level-review'` and `'hr-pms-review'`, which the workflow engine already supports.

## Corrective Action Plan

### File 1: `src/components/review/KpiDetailsTable.tsx`

**Line 32** -- Expand the `KpiTableViewType` to include the two missing view types:

```typescript
export type KpiTableViewType = 'my-kpis' | 'team-review' | 'audit' | 'management' | 'skip-level-review' | 'hr-pms-review';
```

**Lines 128-129** -- Update the `isTeamReviewPastStage` check to also handle skip-level and HR PMS "past stage" states so those views show "Reviewed" badges correctly for KPIs that have already been forwarded.

**Lines 147** -- Update the send-back button visibility condition to include `'skip-level-review'` and `'hr-pms-review'` alongside `'team-review'`, `'audit'`, and `'management'`.

### File 2: `src/components/review/UnifiedScorecard.tsx`

**Line 685** -- Fix the viewType mapping to include skip-level and HR PMS:

```typescript
const viewType = viewLevel === 'manager' ? 'team-review'
               : viewLevel === 'auditor' ? 'audit'
               : viewLevel === 'skip_level' ? 'skip-level-review'
               : viewLevel === 'hr_pms' ? 'hr-pms-review'
               : 'management';
```

### File 3: `DOCUMENTATION.md`

Update to document the expanded `KpiTableViewType` and the corrected viewType mapping.

## Summary of Changes

| File | Change |
|---|---|
| `src/components/review/KpiDetailsTable.tsx` | Add `'skip-level-review'` and `'hr-pms-review'` to `KpiTableViewType`; update past-stage and send-back button conditions |
| `src/components/review/UnifiedScorecard.tsx` | Fix viewType mapping for `skip_level` and `hr_pms` view levels |
| `DOCUMENTATION.md` | Document the fix |
