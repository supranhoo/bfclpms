

# Fix "Done" Badge Showing Instead of "Draft" for Management-Drafted KPIs

## Problem

When a user (e.g., Gaurav Budhiya) serves as both **Manager** and **Management Reviewer**, the Team Reviews mode shows a green **"Done"** badge on KPIs that are at `management_review` status with a saved draft score. This misleads the user into thinking the KPI is fully complete, when in reality the management review was only drafted (Save Draft) and not formally approved (Final Approve).

## Root Cause

In `MobileKpiCard.tsx`, the `isTeamReviewPastStage` check treats any KPI past `self_review` (including `management_review`) as "Done" for the team-review view. This is technically correct from the manager perspective -- their work IS done. But for dual-role users, it hides the fact that their management-level action is still pending.

Similarly, in `KpiDetailsTable.tsx` and `EmployeeSelectorGrid.tsx`, there is no distinction between "forwarded past my stage" and "drafted at a later stage where I'm also a reviewer."

## Solution

Introduce a **"Draft (Mgmt)"** badge that appears instead of "Done" when:
- The view is `team-review` (or any non-management view)
- The KPI status is `management_review` (not yet `approved`)
- The submission has a `management_score` saved (meaning someone drafted it)

This gives dual-role users a clear signal that their management-level action is still pending.

## Changes

### 1. `src/components/review/MobileKpiCard.tsx`

In the `getActionContent` function, before the `isTeamReviewPastStage` check (line 158), add a condition:

```text
// Before showing "Done" for team-review past stage, check if KPI is drafted at management
const isMgmtDrafted = viewType === 'team-review' && 
  kpi.status === 'management_review' && 
  submission?.management_score !== null && submission?.management_score !== undefined;

if (isMgmtDrafted) {
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-300 text-xs">
        <Clock className="h-3 w-3 mr-1" />
        Draft (Mgmt)
      </Badge>
      {onView && (
        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => onView(kpi)}>
          <Eye className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
```

- Add `Clock` to the lucide-react imports

### 2. `src/components/review/EmployeeSelectorGrid.tsx`

For the **management view** (lines 446-452), split the `badge1` count to distinguish between "pending" (no score yet) and "drafted" (score saved but not approved):

```text
// Management view
badge1: empKpis.filter(k => 
  k.status === 'management_review'
).length,
badge2: empKpis.filter(k => k.status === 'approved').length,
```

This part is already correct -- `badge1` shows "pending" and `badge2` shows "approved". No change needed here.

For the **team view** (lines 411-416), the "reviewed" badge already correctly counts KPIs past `self_review`. However, we should add a third badge for KPIs that are at `management_review` with a drafted score. This requires access to submission data.

Since the `EmployeeSelectorGrid` does not currently have submission data, and adding it would increase complexity, we will instead:

- Add a helper function that checks submission data when available
- For now, keep the team-view badges as-is (they correctly show the manager's completed work)

The primary fix is the `MobileKpiCard` badge label change, which is where the user sees the confusing "Done."

### 3. `src/components/review/KpiDetailsTable.tsx`

Check if there is an action column that shows "Done" status for team-review. If so, apply the same draft detection logic.

### 4. `DOCUMENTATION.md`

Update the workflow documentation to note:
- KPIs at `management_review` with a saved score show "Draft (Mgmt)" in non-management views
- This helps dual-role users identify pending management approvals

## Impact

- **Visual only** -- no database, schema, or workflow logic changes
- Only affects the badge label displayed in `MobileKpiCard` for dual-role users
- "Done" still appears for KPIs that are genuinely `approved`
- No changes to the actual approval/forwarding workflow

