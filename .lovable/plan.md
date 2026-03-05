

# Show "X reviewed" Badge for Indirect Reports in Team View

## Problem
In the Team Members grid, Direct reports show a "2 reviewed" badge (green), but Indirect reports (e.g., Vivek Kumar Tripathi) show no such badge — only the "Indirect" label appears. This is because the reviewed count for indirect employees (`badge2`) uses a stricter definition: it only counts KPIs that have passed the `skip_level_check` stage. KPIs that have been reviewed by the manager but haven't yet reached the skip-level reviewer show as 0 reviewed.

## Root Cause
In `getEmployeeKpiStats` (lines 264-275), for indirect reports:
- `badge1` = KPIs reviewable at skip-level (pending for this reviewer)
- `badge2` = KPIs that have passed skip-level check (done stages)

KPIs reviewed by the manager but not yet at skip-level are counted in neither badge — they fall into a gap.

## Fix
**File: `src/components/review/EmployeeSelectorGrid.tsx`**

In the `renderBadges` block for `viewLevel === 'team'` (lines 680-703), the "reviewed" badge is already rendered for both Direct and Indirect when `badge2 > 0`. The issue is in the stats calculation. For indirect reports, `badge2` should count all KPIs that have progressed past `kra_set` and `self_review` (i.e., have been reviewed by at least the manager level), matching the same definition used for direct reports.

**Change in `getEmployeeKpiStats`** (lines 264-275): For indirect employees in team view, set `badge2` to count KPIs that are beyond `self_review` (same as direct reports), so the reviewer sees how many KPIs have been reviewed overall. Keep `badge1` as skip-level pending count.

```typescript
// For indirect in team view:
badge2: empKpis.filter(k => !['kra_set', 'self_review'].includes(k.status || '')).length,
```

**1 file, ~2 lines changed.**

