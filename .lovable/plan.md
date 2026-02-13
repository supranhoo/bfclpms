
# Fix: Workflow Engine Props Not Passed to Child Components

## Root Cause Analysis (RCA)

The previous CAPA correctly built the workflow engine and wired it into `UnifiedScorecard.tsx` for computing `reviewableStatuses`, `forwardStatus`, and `sendBackTargets`. However, **two critical prop-passing gaps** prevent the fix from actually working:

### Gap 1: `KpiDetailsTable` missing `workflowStages` prop (PRIMARY BUG)

In `UnifiedScorecard.tsx` line 805, `KpiDetailsTable` is rendered **without** the `workflowStages` prop:

```tsx
<KpiDetailsTable
  kpis={sortedKpis}
  submissionMap={submissionMap}
  viewType={viewType}
  // ... other props
  // workflowStages={effectiveStages}  <-- MISSING!
/>
```

Because `workflowStages` is undefined, `KpiDetailsTable` defaults to `DEFAULT_WORKFLOW_STAGES` (full 6-stage pipeline). The `canReviewKpi` function then sees `manager_check` in the stages and requires `kpiStatus === 'manager_check'` for audit -- so Jaspal's `self_review` KPIs show "View" instead of "Review".

### Gap 2: `WorkflowProgressTracker` missing `workflowStages` prop

In `UnifiedScorecard.tsx` line 759:
```tsx
<WorkflowProgressTracker kpis={kpis || []} queries={queries || []} />
```
No `workflowStages` prop, so the tracker always shows all 6 stages including Manager Check, even for Jaspal who has a skip-manager workflow.

### Gap 3: Legacy pages completely untouched

`AuditPanel.tsx` and `AuditScorecard.tsx` (legacy standalone pages) were never updated with the workflow engine. They hardcode `manager_check` for pending counts, stats, and status transitions. While the sidebar now routes to `/dashboard?view=audit` (which uses the unified path), these legacy pages still exist and could be accessed via direct URL.

---

## CAPA (Corrective Actions)

### 1. Pass `workflowStages` to `KpiDetailsTable` in `UnifiedScorecard.tsx`

Add the `workflowStages={effectiveStages}` prop at line ~805. This is the single-line fix that resolves the primary bug -- the "Review" button will now appear for Jaspal's `self_review` KPIs in audit view.

### 2. Pass `workflowStages` to `WorkflowProgressTracker` in `UnifiedScorecard.tsx`

Add `workflowStages={effectiveStages}` at line ~759 so the progress tracker only shows stages relevant to the employee's workflow.

### 3. Update legacy `AuditScorecard.tsx`

Wire in the workflow engine:
- Import and call `useEmployeeWorkflowStages(employee.id)`
- Update `pendingAuditCount` (line 203) to include `self_review` for skip-manager workflows
- Update the `submitAuditReview` mutation to use `resolveForwardStatus` instead of hardcoded `management_review`
- Update `sendBack` mutation to use `resolveSendBackStatus`
- Pass `workflowStages` to `WorkflowProgressTracker` and `KpiDetailsTable`

### 4. Update legacy `AuditPanel.tsx`

- Update `pendingAudit` stat (line 89) to include `self_review` KPIs
- Update status filter (line 67) to include `self_review` in pending
- Update `getEmployeeKpiStats` (line 132) to include `self_review` in pending count

### 5. Update `DOCUMENTATION.md`

Document the prop-passing requirements and the complete list of files that must pass `workflowStages`.

---

## Technical Details

### Files to modify:
- `src/components/review/UnifiedScorecard.tsx` -- Add `workflowStages` prop to `KpiDetailsTable` and `WorkflowProgressTracker`
- `src/components/review/AuditScorecard.tsx` -- Wire in workflow engine for dynamic transitions
- `src/pages/AuditPanel.tsx` -- Include `self_review` in audit pending counts/filters
- `DOCUMENTATION.md` -- Update workflow integration docs

### Verification
After the fix, Jaspal's KPIs (status: `self_review`, workflow: `skip_manager`) should:
1. Appear as "pending" in the audit employee list
2. Show "Review" button (not "View") in the KPI table
3. Display only 5 stages in the workflow tracker (no Manager Check)
4. Forward correctly to `management_review` on approval
