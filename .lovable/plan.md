

# Fix Bottleneck Resolver for `audit` and `management_review` Statuses (v1.45.92)

## Root Cause

The `resolveBottleneckStage` function in `src/lib/bottleneckResolver.ts` assumes every KPI status represents a **completed** stage and looks at the **next** pipeline stage to determine who is responsible. This is correct for most statuses but **wrong for two**:

| Status | Resolver says | Actually responsible | Why |
|--------|--------------|---------------------|-----|
| `audit` | Awaiting Management (next stage) | **Awaiting Audit** (Auditor) | Auditor reviews KPIs AT `audit` status (confirmed by `canReviewKpi`) |
| `management_review` | Approved (next = approved, then dropped) | **Awaiting Management** | Management reviews KPIs AT `management_review` status |

This causes:
- 250 Audit KPIs in Jan being miscounted as "Management"
- Management KPIs being silently **dropped** from the report (filtered out as "Approved")
- All summary card totals are wrong

## Solution

Instead of always using "next stage" logic, align with the workflow engine's own `resolvePendingStatuses` function which defines exactly which statuses each reviewer role acts on. Specifically:

- `audit` status maps to **Awaiting Audit** (Auditor is responsible)
- `management_review` status maps to **Awaiting Management** (Management is responsible)

## Technical Changes

### `src/lib/bottleneckResolver.ts`

Update `resolveBottleneckStage` to handle `audit` and `management_review` as **"current stage = active reviewer"** rather than "look at next stage":

```
function resolveBottleneckStage(kpiStatus, workflowStages):
  if kpiStatus === 'kra_set' -> awaiting_self_review (unchanged)
  
  // NEW: These statuses mean the KPI IS at this reviewer
  if kpiStatus === 'audit' -> awaiting_audit (Auditor responsible)
  if kpiStatus === 'management_review' -> awaiting_management (Management responsible)
  
  // For all other statuses, use "next stage" logic (unchanged)
  find currentIndex in pipeline
  nextStage = pipeline[currentIndex + 1]
  map nextStage to responsible role
```

This is a minimal, surgical fix -- only adding two explicit checks before the existing "next stage" logic.

### `DOCUMENTATION.md`

Bump version to v1.45.92 and document the fix.

## Why This Is Correct

The workflow engine (`src/lib/workflowEngine.ts`) confirms this behavior:

- `canReviewKpi('audit', 'audit', stages)` returns `true` -- auditor acts on `audit` status
- `canReviewKpi('management_review', 'management', stages)` returns `true` -- management acts on `management_review` status
- `resolvePendingStatuses('auditor', stages)` includes `'audit'` -- auditor sees `audit` as pending
- `resolvePendingStatuses('management', stages)` returns `['management_review']` -- management sees it as pending

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None -- read-only report | No schema changes |
| Regression | Low -- only changes 2 status mappings | Aligns with workflow engine's own logic |
| Accuracy | High confidence -- will match dashboard counts | Uses same semantics as `canReviewKpi` |

