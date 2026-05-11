## Issue
On `/dashboard?view=team` as **admin (full access)**, the tiles show:
- Direct Pending: **0**
- Skip-Level Pending: **0**
- Reviewed: **0**
- Total KPIs: **1740** ✅
- Total Employees: **2531** ✅

…yet the cards below clearly display badges like "2 pending / 14 reviewed", "1 pending / 26 reviewed" etc. So the zeros are wrong.

## Root cause (RCA)

In `src/components/review/EmployeeSelectorGrid.tsx` (lines ~922–960), the `team` view computes the three pending/reviewed tiles like this:

```ts
const skipIds   = new Set(skipLevelMembers?.map(m => m.id) || []);
const directIds = new Set(teamMembers?.map(m => m.id) || []);

relevantKpis.forEach(k => {
  if (skipIds.has(k.employee_id))      { /* skipPending / reviewed */ }
  else if (directIds.has(k.employee_id)) { /* directPending / reviewed */ }
  // else: ignored
});
```

Console proves it:
```
role: 'admin', isFullAccess: true, viewLevel: 'team',
allProfiles_len: 2532, teamMembers_len: 0, skipLevelMembers_len: 0
```

Admin has **no direct reports and no skip-level reports**, so `directIds` and `skipIds` are both empty. Every KPI falls through the `else` branch and nothing is counted — hence three zeros.

The card badges look correct because they use a different code path (`getEmployeeKpiStats`, per-employee workflow-aware), so the discrepancy between tiles (0/0/0) and cards (lots of pending + reviewed) is the visible symptom.

## Fix plan

For **full-access roles** (`admin`, `auditor`, `management`, `hr_pms`) on the `team` viewLevel, the direct/skip-membership classification doesn't apply — they see the whole org. Compute the tiles from each KPI's actual workflow position instead:

In the `viewLevel === 'team'` branch of the `stats` `useMemo`:

1. If `isFullAccess`, classify each KPI in `relevantKpis` by workflow status (using the same `getStages` / `resolveReviewableStatuses` helpers already in the file):
   - **Direct Pending** = KPIs with `status === 'self_review'` (awaiting manager).
   - **Skip-Level Pending** = KPIs whose status is in `resolveReviewableStatuses('skip_level', stages)` for the employee's resolved workflow.
   - **Reviewed** = KPIs whose status has advanced past the manager stage (i.e. anything beyond `kra_set` / `self_review` that is not currently pending at skip), aligned with the current "reviewed" semantics used on the per-employee cards so tiles and badges agree.
2. If **not** full access, keep the existing direct/skip membership logic (managers genuinely have direct/skip rosters).
3. No change to Total Employees / Total KPIs (already correct after the chunked-pagination fix).

## Risk & Impact Report

- **Data Impact:** None. Pure client-side aggregation change; no schema/RLS/migration.
- **Workflow Impact:** None. No status transitions or permissions touched.
- **UI/UX Consistency:** Tile numbers will finally match the badges already shown on the cards, removing user confusion.
- **Regression Risk:** Low — change is gated on `isFullAccess && viewLevel === 'team'`. Manager flows (the common case) keep the existing branch untouched.
- **Mitigation:**
  - Add a unit test in `src/test/` that feeds a mocked admin scenario (empty teamMembers/skipLevelMembers, mixed KPI statuses across employees) and asserts non-zero `directPending`, `skipPending`, `reviewed` matching the workflow-derived expectation.
  - Manually verify in preview after the change that Mar-2026 tiles sum consistently with card badges.

## Docs sync (per SSOT policy)

- **DOCUMENTATION.md** – add a v2.66.11.6 entry under "Team Reviews dashboard" describing full-access tile aggregation.
- **POLICY.md** – extend the existing tile-counting section: *"For full-access roles on the merged Team view, pending/reviewed tiles are computed from each KPI's resolved workflow position, not from direct/skip-report membership (which is empty for admins)."*

## Files to touch

- `src/components/review/EmployeeSelectorGrid.tsx` — branch in the `team` stats `useMemo`.
- `src/test/` — new regression test for full-access team-view tiles.
- `DOCUMENTATION.md`, `POLICY.md` — atomic policy/doc sync.
