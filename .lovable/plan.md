

# Plan: Add "Review Timeline" Button to View KPI Details for All Users

## Summary

The "Timeline" button is already designed to appear in the KPI header section within `KpiReviewPanel`, but the callback is not being passed from the parent scorecard components. This plan wires up the existing timeline functionality to all user views.

---

## Current State

| File | `timelineOpen` state | `KpiTimeline` component | `onOpenTimeline` passed | Timeline Button Shows |
|------|---------------------|------------------------|------------------------|----------------------|
| MyKpis.tsx | Line 156 | Line 1225 | **NO** | **NO** |
| EmployeeScorecard.tsx | Line 128 | Line 890 | **NO** | **NO** |
| AuditScorecard.tsx | Line 123 | Line 892 | **NO** | **NO** |
| ManagementScorecard.tsx | Line 128 | Line 923 | **NO** | **NO** |

---

## Root Cause

The `KpiHeaderSection` component checks if `onOpenTimeline` prop exists before rendering the Timeline button:

```tsx
// src/components/review/KpiHeaderSection.tsx (lines 45-55)
{onOpenTimeline && (
  <Button variant="outline" size="sm" onClick={onOpenTimeline}>
    <Clock className="h-3 w-3" />
    Timeline
  </Button>
)}
```

Since none of the parent scorecards pass this prop, the button never renders.

---

## Solution

Add `onOpenTimeline={() => setTimelineOpen(true)}` to each `KpiReviewPanel` instance:

### 1. MyKpis.tsx (Employee's own KPIs view)
```tsx
// Line ~854-864
<KpiReviewPanel
  kpi={selectedKpi}
  submission={submissionMap.get(selectedKpi.id) || null}
  allKpis={allKpis || []}
  allSubmissions={submissions || []}
  viewLevel="employee"
  currentUserId={profile?.id}
  selectedPeriod={selectedPeriod}
  selectedYear={selectedYear}
  onOpenFullHistory={() => setTrackerModalOpen(true)}
  onOpenTimeline={() => setTimelineOpen(true)}  // ADD THIS
/>
```

### 2. EmployeeScorecard.tsx (Manager viewing team member)
```tsx
// Line ~618-630
<KpiReviewPanel
  kpi={selectedKpi}
  submission={submissionMap.get(selectedKpi.id) || null}
  allKpis={allKpis || []}
  allSubmissions={submissions || []}
  queries={queryMap.get(selectedKpi.id) || []}
  viewLevel="manager"
  currentUserId={user?.id}
  selectedPeriod={selectedPeriod}
  selectedYear={selectedYear}
  onOpenQueryHistory={() => setHistoryDialogOpen(true)}
  onOpenFullHistory={() => setTrackerModalOpen(true)}
  onOpenTimeline={() => setTimelineOpen(true)}  // ADD THIS
/>
```

### 3. AuditScorecard.tsx (Auditor view)
```tsx
// Line ~642-653
<KpiReviewPanel
  kpi={selectedKpi}
  submission={submissionMap.get(selectedKpi.id) || null}
  allKpis={allKpis || []}
  allSubmissions={submissions || []}
  queries={queryMap.get(selectedKpi.id) || []}
  viewLevel="auditor"
  selectedPeriod={selectedPeriod}
  selectedYear={selectedYear}
  onOpenQueryHistory={() => setHistoryDialogOpen(true)}
  onOpenFullHistory={() => setTrackerModalOpen(true)}
  onOpenTimeline={() => setTimelineOpen(true)}  // ADD THIS
/>
```

### 4. ManagementScorecard.tsx (Management view)
```tsx
// Line ~671-682
<KpiReviewPanel
  kpi={selectedKpi}
  submission={submissionMap.get(selectedKpi.id) || null}
  allKpis={allKpis || []}
  allSubmissions={submissions || []}
  queries={queryMap.get(selectedKpi.id) || []}
  viewLevel="management"
  selectedPeriod={selectedPeriod}
  selectedYear={selectedYear}
  onOpenQueryHistory={() => setHistoryDialogOpen(true)}
  onOpenFullHistory={() => setTrackerModalOpen(true)}
  onOpenTimeline={() => setTimelineOpen(true)}  // ADD THIS
/>
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/MyKpis.tsx` | Add `onOpenTimeline` prop to KpiReviewPanel |
| `src/components/review/EmployeeScorecard.tsx` | Add `onOpenTimeline` prop to KpiReviewPanel |
| `src/components/review/AuditScorecard.tsx` | Add `onOpenTimeline` prop to KpiReviewPanel |
| `src/components/review/ManagementScorecard.tsx` | Add `onOpenTimeline` prop to KpiReviewPanel |

---

## Visual Result

After this change, the "Timeline" button will appear in the KPI header section for all users:

```text
+-----------------------------------------------------------------+
| [PMS]          [Approved]  [February 2026]  [40%]  [Timeline] ←--|-- NEW BUTTON
+-----------------------------------------------------------------+
| Performance Review Cycle Management                              |
| On-time Completion of Monthly Performance Reviews...             |
+-----------------------------------------------------------------+
```

The button will be visible:
- For employees viewing their own KPIs (My KPIs page)
- For managers viewing team member KPIs (Team Review)
- For auditors reviewing KPIs (Audit Panel)
- For management reviewing KPIs (Management Review)
- For all statuses including "Approved"

---

## Testing Checklist

- [ ] Timeline button appears in View KPI Details sheet for employees
- [ ] Timeline button appears for managers in Team Review
- [ ] Timeline button appears for auditors in Audit Panel
- [ ] Timeline button appears for management in Management Review
- [ ] Timeline button works for all KPI statuses (including Approved)
- [ ] Clicking Timeline button opens the KPI Timeline modal
- [ ] Timeline modal displays all audit events correctly

