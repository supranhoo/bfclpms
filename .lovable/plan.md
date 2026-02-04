

# Fix: Show View Button for Completed/Forwarded KPIs Across All Review Levels

## Problem Identified

Users cannot access the "View" button to see full KPI details when a KPI has moved past their review stage or is completed. This affects all review levels:

| View Type | Current Issue |
|-----------|---------------|
| **Team Review** | When KPI status is `manager_check`, `audit`, `management_review`, or `approved` - no View button shown |
| **Audit Panel** | When KPI is "Forwarded" (status = `management_review` or `approved`) - only badge shown, no View button |
| **Management Review** | When KPI is "Completed" (status = `approved`) - only badge shown, no View button |

### Root Cause

In `src/components/review/KpiDetailsTable.tsx`, the `getActionButton` function (lines 184-216) has a conditional chain that returns early with just a status badge, never reaching the `onView` button logic:

```typescript
// Current problematic logic:
canReviewKpi(kpi) ? (
  <Button>Review</Button>
) : isApproved && viewType === 'management' ? (
  <Badge>Completed</Badge>  // ← Returns here, no View button!
) : isForwarded ? (
  <Badge>Forwarded</Badge>  // ← Returns here, no View button!
) : isNaKpi ? (
  <Badge>Not Applicable</Badge>
) : onView ? (
  <Button>View</Button>  // ← Never reached for approved/forwarded
) : null
```

---

## Solution

Modify the `getActionButton` function to show **both** the status badge AND the View button for all completed/forwarded states across all view types.

---

## Technical Implementation

### File: `src/components/review/KpiDetailsTable.tsx`

Update lines 197-216 to render View button alongside status badges:

**Before:**
```typescript
} : isApproved && viewType === 'management' ? (
  <Badge variant="outline" className="bg-green-50...">
    <CheckCircle2 className="h-3 w-3 mr-1" />
    Completed
  </Badge>
) : isForwarded ? (
  <Badge variant="outline" className="bg-green-50...">
    <CheckCircle2 className="h-3 w-3 mr-1" />
    Forwarded
  </Badge>
) : isNaKpi ? (
  <Badge variant="outline" className="bg-muted...">
    Not Applicable
  </Badge>
) : onView ? (
  <Button size="sm" variant="outline" onClick={() => onView(kpi)}>
    <Eye className="h-4 w-4 mr-1" />
    View
  </Button>
) : null}
```

**After:**
```typescript
} : isApproved && viewType === 'management' ? (
  <>
    <Badge variant="outline" className="bg-green-50...">
      <CheckCircle2 className="h-3 w-3 mr-1" />
      Completed
    </Badge>
    {onView && (
      <Button size="sm" variant="ghost" onClick={() => onView(kpi)} title="View KPI Details">
        <Eye className="h-4 w-4" />
      </Button>
    )}
  </>
) : isForwarded ? (
  <>
    <Badge variant="outline" className="bg-green-50...">
      <CheckCircle2 className="h-3 w-3 mr-1" />
      Forwarded
    </Badge>
    {onView && (
      <Button size="sm" variant="ghost" onClick={() => onView(kpi)} title="View KPI Details">
        <Eye className="h-4 w-4" />
      </Button>
    )}
  </>
) : isNaKpi ? (
  <Badge variant="outline" className="bg-muted...">
    Not Applicable
  </Badge>
) : onView ? (
  <Button size="sm" variant="outline" onClick={() => onView(kpi)}>
    <Eye className="h-4 w-4 mr-1" />
    View
  </Button>
) : null}
```

### Additional Enhancement: Team Review Past-Stage States

For Team Review, add badge + View button for KPIs that have moved past `self_review`:

```typescript
// Add new condition for Team Review past-stage states
const isTeamReviewPastStage = viewType === 'team-review' && 
  ['manager_check', 'audit', 'management_review', 'approved'].includes(kpi.status);
```

Then in the conditional chain:
```typescript
} : isTeamReviewPastStage ? (
  <>
    <Badge variant="outline" className="bg-blue-50 text-blue-700...">
      <CheckCircle2 className="h-3 w-3 mr-1" />
      Reviewed
    </Badge>
    {onView && (
      <Button size="sm" variant="ghost" onClick={() => onView(kpi)} title="View KPI Details">
        <Eye className="h-4 w-4" />
      </Button>
    )}
  </>
)
```

---

## Complete Status Badge + View Button Matrix

| View Type | KPI Status | Badge Text | View Button |
|-----------|------------|------------|-------------|
| Team Review | `manager_check`, `audit`, `management_review`, `approved` | "Reviewed" | ✅ Yes |
| Audit Panel | `management_review`, `approved` | "Forwarded" | ✅ Yes |
| Management Review | `approved` | "Completed" | ✅ Yes |
| Any | N/A KPIs | "Not Applicable" | ❌ No (no details to view) |

---

## Visual Design

The View button will appear as a ghost icon button next to the status badge:

```
┌───────────────────────────────────────────────────────────────┐
│ ... │ Status           │ Actions                              │
├───────────────────────────────────────────────────────────────┤
│ ... │ manager_check    │ [✓ Reviewed] [👁]    (Team Review)   │
│ ... │ approved         │ [✓ Forwarded] [👁]   (Audit Panel)   │
│ ... │ approved         │ [✓ Completed] [👁]   (Management)    │
└───────────────────────────────────────────────────────────────┘
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/review/KpiDetailsTable.tsx` | Add View button alongside all completion/forwarded badges |
| `DOCUMENTATION.md` | Update to reflect View button availability across all levels |

---

## Implementation Steps

1. **Add status variable for Team Review past-stage KPIs**
   - Define `isTeamReviewPastStage` condition

2. **Update conditional chain in `getActionButton`**
   - Management "Completed" → Badge + View button
   - Audit "Forwarded" → Badge + View button  
   - Team Review "Reviewed" → Badge + View button (new)
   - N/A → Badge only (unchanged)

3. **Update documentation**

---

## Benefits

| Benefit | Impact |
|---------|--------|
| **Full Audit Trail Access** | All reviewers can see details after their stage completes |
| **Historical Reference** | Check scoring details and remarks at any time |
| **Consistency** | Same View experience across all review levels |
| **Transparency** | Managers can track KPIs through the entire workflow |

