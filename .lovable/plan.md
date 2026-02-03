
# Plan: Unified KPI View Access Across All Review Levels

## Problem Summary

Currently, the `KpiReviewPanel` component (which provides the complete KPI information with history, metrics, and review journey) is only integrated into:
- **EmployeeScorecard** (Team Review - Manager level)
- **AuditScorecard** (Audit level)
- **ManagementScorecard** (Management level)

However, the **MyKpis.tsx** page (Employee level) still uses an older sheet layout that doesn't include the `KpiReviewPanel`. This creates an inconsistent experience where employees cannot see the same comprehensive view available to other review levels.

The user wants the **same view option** (with KpiReviewPanel including history, metrics, and journey) to be accessible uniformly at all review levels.

---

## Current State Analysis

| Level | Page/Component | Uses KpiReviewPanel | View Button Available |
|-------|---------------|---------------------|----------------------|
| Employee (Self) | MyKpis.tsx | No - uses old layout | Yes, but different UI |
| Manager | EmployeeScorecard.tsx | Yes | Yes |
| Auditor | AuditScorecard.tsx | Yes | Yes |
| Management | ManagementScorecard.tsx | Yes | Yes |

---

## Solution

Update **MyKpis.tsx** to use the same `KpiReviewPanel` component in its review sheet, ensuring employees see the exact same structured layout with:
- KPI Header Section
- Metrics & Rating Scale
- KPI History Card with sparkline
- Review Journey (showing their own submission status)

This creates a uniform experience across all levels.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/MyKpis.tsx` | Replace old sheet content with KpiReviewPanel for both edit and view modes |
| `DOCUMENTATION.md` | Document unified view architecture |

---

## Technical Changes

### MyKpis.tsx Updates

1. **Import KpiReviewPanel and related components**
   - Add imports for `KpiReviewPanel`, `KpiTrackerModal`, `QueryHistoryDialog`

2. **Add state for modals**
   - `trackerModalOpen` for full history modal
   - `historyDialogOpen` for query history (if applicable)

3. **Update Sheet content structure**
   - Use the same wide sheet format: `w-[85vw] max-w-[1200px]`
   - Add `KpiReviewPanel` at the top of the sheet for both edit and view modes
   - Keep existing form elements below (for edit mode)
   - Keep daily submission components where applicable

4. **Ensure consistent layout**
   - Read-only mode: Show `KpiReviewPanel` + view-only banners
   - Edit mode: Show `KpiReviewPanel` + form inputs below

---

## Implementation Details

### Sheet Content Structure for MyKpis

```tsx
<SheetContent className="flex flex-col h-full w-[85vw] max-w-[1200px] sm:max-w-[1200px] overflow-y-auto">
  <SheetHeader>
    <SheetTitle>{isReadOnly ? 'View KPI Details' : 'Submit Self Review'}</SheetTitle>
    {/* Status badges */}
  </SheetHeader>

  <div className="flex-1 overflow-y-auto py-4 space-y-6">
    {/* KPI Review Panel - Shows header, metrics, history, journey */}
    <KpiReviewPanel
      kpi={selectedKpi}
      submission={submissionMap.get(selectedKpi.id) || null}
      allKpis={allKpis || []}
      allSubmissions={submissions || []}
      viewLevel="employee"
      selectedPeriod={selectedPeriod}
      selectedYear={selectedYear}
      onOpenFullHistory={() => setTrackerModalOpen(true)}
    />

    {/* Daily Submission Summary (if Daily KPI) */}
    {selectedKpi.frequency === 'Daily' && (
      <DailySubmissionSummary ... />
    )}

    {/* Self Assessment Form (only in edit mode) */}
    {!isReadOnly && (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Your Assessment</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Achieved Value Input */}
          {/* Score Display */}
          {/* Remarks */}
          {/* Evidence Upload */}
        </CardContent>
      </Card>
    )}
  </div>

  <SheetFooter>
    {/* Cancel, Save, Submit buttons */}
  </SheetFooter>
</SheetContent>
```

### View Level Configuration for Employee

The `KpiReviewPanel` with `viewLevel="employee"` will show:
- **KpiHeaderSection**: Full KPI details
- **KpiMetricsSection**: Target, criteria, weightage, rating scale
- **KpiHistoryCard**: Previous months' performance
- **KpiJourneySection**: Only "Self" stage (since other stages aren't visible to employees)

---

## Component Modifications

### 1. Add Missing Imports to MyKpis.tsx

```tsx
import { KpiReviewPanel } from '@/components/review/KpiReviewPanel';
import { KpiTrackerModal } from '@/components/dashboard/KpiTrackerModal';
```

### 2. Add State Variables

```tsx
const [trackerModalOpen, setTrackerModalOpen] = useState(false);
```

### 3. Update Sheet Width

Change from current layout to:
```tsx
<SheetContent className="flex flex-col h-full w-[85vw] max-w-[1200px] sm:max-w-[1200px] overflow-y-auto">
```

### 4. Add KpiReviewPanel Before Form

Insert `KpiReviewPanel` component at the top of the sheet content, before any form elements.

### 5. Add KpiTrackerModal

Add the modal component at the end of the page for "View Full History" functionality.

---

## Testing Checklist

### My KPIs (Employee Level)
- [ ] Sheet opens with full width (85vw, max 1200px)
- [ ] KpiReviewPanel displays header section correctly
- [ ] Metrics section shows target, criteria, weightage
- [ ] Rating scale is visible inline
- [ ] KPI History card shows previous months (if available)
- [ ] "View Full History" button opens KpiTrackerModal
- [ ] Review Journey shows Self stage only
- [ ] Form inputs work correctly in edit mode
- [ ] Read-only mode hides form inputs
- [ ] Daily KPIs show submission summary

### Consistency Across Levels
- [ ] All levels use same sheet width
- [ ] All levels show KpiReviewPanel with same structure
- [ ] History card appears consistently
- [ ] Journey section adapts to view level

### Edge Cases
- [ ] New KPIs (no history) - history card hidden
- [ ] Org-level KPIs - pre-filled values shown
- [ ] Daily/Weekly KPIs - sub-period selector works
- [ ] Read-only KPIs - no form visible

---

## Implementation Order

1. Update `MyKpis.tsx`:
   - Add imports for `KpiReviewPanel` and `KpiTrackerModal`
   - Add `trackerModalOpen` state
   - Update Sheet width class
   - Add `KpiReviewPanel` component in sheet content
   - Add `KpiTrackerModal` for full history
   - Reorganize form elements to appear below the panel

2. Test the employee view matches other levels

3. Update `DOCUMENTATION.md` to reflect unified architecture
