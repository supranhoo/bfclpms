
# Plan: Always Show "View KPI Details" Button Across All Review Levels

## Problem Summary

Currently, the "View" button (Eye icon) that opens the KPI Details window with `KpiReviewPanel` is not consistently available:

| Level | Current Behavior |
|-------|-----------------|
| **Manager (Team Review)** | View only for Daily KPIs or when not in reviewable status |
| **Auditor (Audit Panel)** | No View button - `onView` prop not passed |
| **Management** | No View button - `onView` prop not passed |

The user requires **all levels** to always see the "View KPI Details" window (with `KpiReviewPanel` showing all 4 stages) regardless of KPI status or frequency.

---

## Solution

1. Pass the `onView` prop to `KpiDetailsTable` in AuditScorecard and ManagementScorecard
2. Update `KpiDetailsTable` to always show a "View" button when `onView` is provided (not just for Daily KPIs)
3. The Review button remains available for reviewable KPIs; View becomes a secondary action

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/review/KpiDetailsTable.tsx` | Update action button logic to always show View when `onView` is provided |
| `src/components/review/AuditScorecard.tsx` | Add `onView={openReviewSheet}` prop to KpiDetailsTable |
| `src/components/review/ManagementScorecard.tsx` | Add `onView={openReviewSheet}` prop to KpiDetailsTable |
| `DOCUMENTATION.md` | Update to reflect universal View access |

---

## Technical Implementation

### 1. KpiDetailsTable.tsx - Update Action Button Logic

**Current logic (lines 163-220):**
The View button currently only appears in specific conditions:
- For Daily KPIs (when not NA)
- For my-kpis when status !== 'kra_set'

**New logic:**
```typescript
const getActionButton = (kpi: KPI): React.ReactNode => {
  // ... existing checks for NA, locked, etc.
  
  return (
    <div className="flex items-center gap-1">
      {canReviewKpi(kpi) ? (
        <>
          <Button size="sm" onClick={() => onReview?.(kpi)}>
            {/* Review button */}
          </Button>
          {/* Send Back button */}
        </>
      ) : /* completed states */ }
      
      {/* ALWAYS show View button when onView is provided, except for:
          - NA KPIs
          - Already showing Review button (reviewable status)
          - Completed/Forwarded badges already shown */}
      {onView && !isNaKpi && !canReviewKpi(kpi) && !isApproved && !isForwarded && (
        <Button size="sm" variant="outline" onClick={() => onView(kpi)}>
          <Eye className="h-4 w-4 mr-1" />
          View
        </Button>
      )}
      
      {/* Daily expand toggle remains separate */}
    </div>
  );
};
```

### 2. AuditScorecard.tsx - Add onView Prop

```typescript
<KpiDetailsTable
  kpis={kpis || []}
  submissionMap={submissionMap}
  queryMap={queryMap as Map<string, KpiQuery[]>}
  viewType="audit"
  selectedPeriod={selectedPeriod}
  selectedYear={selectedYear}
  onReview={openReviewSheet}
  onView={openReviewSheet}  // ADD THIS
  onSendBack={openSendBackDialog}
  onShowLogic={(kpi) => { setSelectedKpi(kpi); setLogicModalOpen(true); }}
  expandedKpis={expandedDailyKpis}
  onToggleExpand={toggleDailyExpand}
/>
```

### 3. ManagementScorecard.tsx - Add onView Prop

```typescript
<KpiDetailsTable
  kpis={kpis || []}
  submissionMap={submissionMap}
  queryMap={queryMap as Map<string, KpiQuery[]>}
  viewType="management"
  selectedPeriod={selectedPeriod}
  selectedYear={selectedYear}
  onReview={openReviewSheet}
  onView={openReviewSheet}  // ADD THIS
  onSendBack={openSendBackDialog}
  onShowLogic={(kpi) => { setSelectedKpi(kpi); setLogicModalOpen(true); }}
  expandedKpis={expandedDailyKpis}
  onToggleExpand={toggleDailyExpand}
/>
```

---

## Visual Result

**Before:**

| KPI Status | Manager | Auditor | Management |
|------------|---------|---------|------------|
| kra_set | - | - | - |
| self_review | Review | - | - |
| manager_check | View (Daily only) | Review | - |
| audit | - | Continue | - |
| management_review | - | - | Review |
| approved | - | Forwarded | Completed |

**After:**

| KPI Status | Manager | Auditor | Management |
|------------|---------|---------|------------|
| kra_set | View | View | View |
| self_review | Review | View | View |
| manager_check | View | Review | View |
| audit | View | Continue | View |
| management_review | View | View | Review |
| approved | View | Forwarded | Completed |

All levels can now always access the "View KPI Details" window with full transparency into all 4 review stages.

---

## Testing Checklist

- [ ] Team Review (Manager): View button appears for all non-reviewable KPIs
- [ ] Audit Panel (Auditor): View button appears for all non-reviewable KPIs
- [ ] Management Review: View button appears for all non-reviewable KPIs
- [ ] Clicking View opens the sheet with KpiReviewPanel showing all 4 stages
- [ ] Review button still works correctly for KPIs in reviewable status
- [ ] N/A KPIs still show "Not Applicable" badge (no View)
- [ ] Daily expand toggle still works independently

---

## Implementation Order

1. Update `KpiDetailsTable.tsx` action button logic
2. Add `onView` prop to `AuditScorecard.tsx`
3. Add `onView` prop to `ManagementScorecard.tsx`
4. Test across all review levels
5. Update `DOCUMENTATION.md`
