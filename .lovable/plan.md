

# Fix: Observations Access and Status Filter Buttons Across All Dashboards

## Bug 1: Users Cannot Raise Observations at All Levels / All Statuses

### Root Cause Analysis

The `canAddObservation()` function in `KpiObservationsSection.tsx` has two restrictions that block users:

```typescript
function canAddObservation(viewLevel: string, kpiStatus: string, isOwnKpi: boolean): boolean {
  if (kpiStatus === 'approved') return false;   // BUG: blocks on approved KPIs
  if (isOwnKpi) return true;
  return ['manager', 'auditor', 'management'].includes(viewLevel);  // BUG: excludes skip_level, hr_pms
}
```

**Problems:**
1. **Approved KPIs are blocked** -- users cannot raise observations on completed/approved KPIs (past months are typically approved)
2. **Skip-Level and HR PMS view levels are excluded** -- these users see the observation section but have no "Add Observation" button
3. **`isReadOnly` is tied to `kpiStatus === 'approved'`** -- this prevents editing/replying on approved KPIs too

**Requirement:** Observations should be allowed at ALL levels, for ALL KPI statuses (past, current, future months), irrespective of approval status.

### Fix

| File | Change |
|---|---|
| `src/components/review/KpiObservationsSection.tsx` | Remove the `kpiStatus === 'approved'` block from `canAddObservation()`. Add `skip_level` and `hr_pms` to the allowed view levels. Remove `isReadOnly` flag so observations (and replies) remain interactive regardless of KPI status. |

**Updated logic:**
```
canAddObservation(viewLevel, kpiStatus, isOwnKpi):
  - If isOwnKpi: return true
  - If viewLevel is manager, skip_level, hr_pms, auditor, or management: return true
  - Otherwise: return false (employee viewing someone else's KPI)

isReadOnly: always false (observations are independent of KPI approval)
```

---

## Bug 2: "KRA SET" / "SELF REVIEW" Stage Filter Buttons Not Working in Reviewer Dashboards

### Root Cause Analysis

The `WorkflowProgressTracker` component supports clickable stage cards via `activeFilter` and `onFilterChange` props. However:

| Dashboard | Props Passed | Clickable? |
|---|---|---|
| My Dashboard (`Dashboard.tsx`) | `activeFilter={statusFilter}` `onFilterChange={setStatusFilter}` | YES |
| UnifiedScorecard (Team/Manager) | No filter props | NO |
| AuditScorecard | No filter props | NO |
| ManagementScorecard | No filter props | NO |
| EmployeeScorecard | No filter props | NO |

The stage cards render correctly with counts but clicking them does nothing because no `onFilterChange` callback is passed. The component checks `const isClickable = !!onFilterChange` and skips click handling.

### Fix

Add `statusFilter` state and pass `activeFilter`/`onFilterChange` props to `WorkflowProgressTracker` in all four scorecard components. Then apply the filter to the KPI list before rendering.

| File | Change |
|---|---|
| `src/components/review/UnifiedScorecard.tsx` | Add `statusFilter` state, pass `activeFilter`/`onFilterChange` to `WorkflowProgressTracker`, filter `sortedKpis` by status |
| `src/components/review/AuditScorecard.tsx` | Same pattern |
| `src/components/review/ManagementScorecard.tsx` | Same pattern |
| `src/components/review/EmployeeScorecard.tsx` | Same pattern |

**Implementation pattern (same for all 4 files):**
```
1. Add state: const [statusFilter, setStatusFilter] = useState<string | null>(null);
2. Reset on employee change: add statusFilter to useEffect resets
3. Pass to tracker: <WorkflowProgressTracker ... activeFilter={statusFilter} onFilterChange={setStatusFilter} />
4. Filter KPIs: if (statusFilter) { sortedKpis = sortedKpis.filter(k => k.status === statusFilter); }
```

---

## File: `DOCUMENTATION.md`

Update documentation to reflect:
- Observations are always available regardless of KPI status
- Stage filter buttons are functional across all review dashboards

---

## Summary of All Files to Change

| File | Bug | Change |
|---|---|---|
| `src/components/review/KpiObservationsSection.tsx` | Bug 1 | Remove status restriction, add skip_level/hr_pms, remove isReadOnly |
| `src/components/review/UnifiedScorecard.tsx` | Bug 2 | Add statusFilter state + wire to WorkflowProgressTracker + filter KPIs |
| `src/components/review/AuditScorecard.tsx` | Bug 2 | Same |
| `src/components/review/ManagementScorecard.tsx` | Bug 2 | Same |
| `src/components/review/EmployeeScorecard.tsx` | Bug 2 | Same |
| `DOCUMENTATION.md` | Both | Document changes |

