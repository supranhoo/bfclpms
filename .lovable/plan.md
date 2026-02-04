
# Plan: Enable View and Access for N/A KPIs

## Problem Identified

N/A (Not Applicable) KPIs are currently hidden from reviewers:

1. **KpiDetailsTable.tsx** - Lines 147-148 return `false` for `canReviewKpi` if `isNaKpi`, and lines 235-238 only show a "Not Applicable" badge with **no View button**
2. **MobileKpiCard.tsx** - Lines 72, 98-104 have the same issue - N/A KPIs just show "N/A" badge with no way to access them
3. **NaConfirmationCard** was created but never integrated into the review sheets (EmployeeScorecard, AuditScorecard, ManagementScorecard)

## Solution Overview

Enable N/A KPIs to be viewed and confirmed at all workflow levels by:
1. Adding a "View" button alongside the N/A badge
2. Allowing N/A KPIs to progress through the workflow with explicit confirmation at each level
3. Integrating the `NaConfirmationCard` component into review sheets

---

## Changes Required

### 1. KpiDetailsTable.tsx - Add View Button for N/A KPIs

**Current (lines 235-238):**
```typescript
} : isNaKpi ? (
  <Badge variant="outline" className="bg-muted text-muted-foreground">
    Not Applicable
  </Badge>
)
```

**Updated:**
```typescript
} : isNaKpi ? (
  <div className="flex items-center gap-1">
    <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-300">
      N/A
    </Badge>
    {onView && (
      <Button size="sm" variant="ghost" onClick={() => onView(kpi)} title="View N/A Details">
        <Eye className="h-4 w-4" />
      </Button>
    )}
  </div>
)
```

### 2. MobileKpiCard.tsx - Add View Button for N/A KPIs

**Current (lines 98-104):**
```typescript
if (isNaKpi) {
  return (
    <Badge variant="outline" className="bg-muted text-muted-foreground text-xs">
      N/A
    </Badge>
  );
}
```

**Updated:**
```typescript
if (isNaKpi) {
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-300 text-xs">
        N/A
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

### 3. EmployeeScorecard.tsx - Integrate NaConfirmationCard

Add N/A confirmation state and UI in the review sheet:

```typescript
// Add state for N/A confirmation
const [naConfirmed, setNaConfirmed] = useState(false);
const [naRemarks, setNaRemarks] = useState('');

// In the Sheet content, show NaConfirmationCard when reviewing N/A KPI
{selectedKpi && selectedSubmission?.is_na && selectedKpi.status === 'self_review' && (
  <NaConfirmationCard
    selfRemarks={selectedSubmission.self_remarks}
    confirmed={naConfirmed}
    onConfirmChange={setNaConfirmed}
    remarks={naRemarks}
    onRemarksChange={setNaRemarks}
    reviewerLevel="Manager"
  />
)}

// Modify the Approve button to handle N/A KPIs
// N/A KPIs require confirmation checkbox before approving
```

### 4. AuditScorecard.tsx - Integrate NaConfirmationCard

Same pattern for Auditor level:
- Add `naConfirmed` and `naRemarks` state
- Show `NaConfirmationCard` with `reviewerLevel="Auditor"`
- Enable "Forward" action when confirmed

### 5. ManagementScorecard.tsx - Integrate NaConfirmationCard

Same pattern for Management level:
- Add `naConfirmed` and `naRemarks` state  
- Show `NaConfirmationCard` with `reviewerLevel="Management"`
- Enable "Approve" action when confirmed

### 6. Update Approve/Forward Mutations to Handle N/A

In all scorecard approve handlers, add N/A confirmation audit logging:

```typescript
// When approving an N/A KPI, log the confirmation
if (submission?.is_na) {
  await supabase.from('kpi_audit_logs').insert({
    kpi_id: selectedKpi.id,
    action: 'MANAGER_NA_CONFIRMED', // or AUDITOR_NA_CONFIRMED, MANAGEMENT_NA_CONFIRMED
    performed_by: user?.id,
    new_value: { na_remarks: naRemarks },
    metadata: { confirmed_at: new Date().toISOString() },
  });
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/review/KpiDetailsTable.tsx` | Add View button next to N/A badge |
| `src/components/review/MobileKpiCard.tsx` | Add View button next to N/A badge |
| `src/components/review/EmployeeScorecard.tsx` | Integrate NaConfirmationCard, add N/A approval flow |
| `src/components/review/AuditScorecard.tsx` | Integrate NaConfirmationCard, add N/A forwarding flow |
| `src/components/review/ManagementScorecard.tsx` | Integrate NaConfirmationCard, add N/A approval flow |

---

## User Experience After Fix

1. **Team Review (Manager)**: Sees N/A KPIs with amber "N/A" badge + Eye icon. Clicking opens sheet showing:
   - Employee's reason for marking N/A
   - Confirmation checkbox
   - Manager remarks field
   - "Approve N/A" button (enabled when confirmed)

2. **Audit Panel (Auditor)**: Same pattern - can view and confirm N/A from manager

3. **Management Review**: Same pattern - final confirmation of N/A status

4. **Timeline**: All N/A confirmations appear in KPI Timeline with remarks

---

## Validation

After changes:
- N/A KPIs will be visible and accessible at all workflow levels
- Reviewers must explicitly confirm N/A status before advancing
- Full audit trail of N/A confirmations maintained
- Desktop and mobile views both support N/A access
