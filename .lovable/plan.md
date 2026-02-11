
# Fix: KPI Tracker Modal Missing Achieved & Rating Data

## Root Cause

The problem is **NOT** about zero-value handling. The real issue is a **data scope mismatch**:

In `UnifiedScorecard.tsx` (where the modal is opened from in team/audit/management view):

```
Line 151:  allKpis = useKpisByEmployee(employee.id)     --> ALL periods (Sep, Oct, Nov, Dec, Jan, Feb)
Line 158:  kpis = allKpis filtered to selectedPeriod      --> CURRENT period only (e.g., December)
Line 196:  kpiIds = kpis.map(k => k.id)                   --> Only December KPI IDs
Line 197:  submissions = useReviewSubmissions(kpiIds)      --> Only December submissions
```

Then the modal receives:
- `allKpis` = all 6 months of KPIs (correct)
- `submissions` = only December's submission (wrong -- missing Oct, Nov, Sep, etc.)

So when the modal builds the monthly history, it finds all 6 related KPIs but can only match submissions for the current period. The other 5 months show "-" because their submissions were never fetched.

The same bug exists in `Dashboard.tsx` -- but there `useMyKpis()` happens to return all periods and `kpiIds` includes all of them, so it works for the self-view. The bug is specific to the team/reviewer views via `UnifiedScorecard`.

## Fix

### `src/components/review/UnifiedScorecard.tsx`

Compute a separate `allKpiIds` list from the unfiltered `allKpis` array, fetch submissions for ALL of them, and pass those to the tracker modal:

```typescript
// Existing (current period only)
const kpiIds = kpis?.map(k => k.id) || [];
const { data: submissions } = useReviewSubmissions(kpiIds);

// New: all-period IDs for the tracker modal
const allKpiIds = useMemo(() => allKpis?.map(k => k.id) || [], [allKpis]);
const { data: allSubmissions } = useReviewSubmissions(allKpiIds);
```

Then pass `allSubmissions` to the KpiTrackerModal instead of `submissions`:

```typescript
<KpiTrackerModal
  ...
  allKpis={allKpis || []}
  submissions={allSubmissions || []}   // was: submissions || []
/>
```

The same fix applies to the `KpiReviewPanel` which also receives `allSubmissions` for the KPI Journey section -- it should use the full dataset too.

### Other Scorecard Components

The same pattern exists in:
- `EmployeeScorecard.tsx`
- `AuditScorecard.tsx`
- `ManagementScorecard.tsx`

Each one filters KPIs to current period for display but passes the filtered submissions to the tracker. All need the same fix.

### `DOCUMENTATION.md`

Update to document that tracker modals require all-period submissions, not just current-period submissions.

## Impact

- **No scoring impact** -- the current-period `submissions` used for score calculations remains unchanged
- **No workflow impact** -- approve/send-back actions use the current-period data
- **Display fix only** -- the tracker modal and KPI Journey now see the complete historical data
- **Minor network cost** -- one additional query for all-period submissions (only runs when tracker modal data is needed)
