
# Plan: Save Achieved Values for Manager, Auditor, and Management Levels

## Problem Summary

The "Review Journey" section shows the employee's submitted value (Value: 15) but does not show values for Manager, Auditor, and Management because:

1. The achieved values are NOT being saved when reviewers submit their reviews
2. Each scorecard has the state variable but doesn't pass it to the mutation
3. The mutation functions don't include the achieved value fields in their database updates

---

## Current Data Flow (Broken)

```text
Manager enters value → managerAchievedValue state ✅
Manager clicks Approve → approveKpi.mutate() ❌ (value not passed)
Database update → manager_achieved_value NOT saved ❌
Review Journey → Shows no value for Manager ❌
```

---

## Solution

### Change 1: Update `useApproveKpi` Hook

**File**: `src/hooks/useKpis.ts` (Lines 615-640)

Add `manager_achieved_value` to the mutation input and database update:

```typescript
mutationFn: async ({
  kpi_id,
  manager_rating,
  manager_score,
  manager_remarks,
  manager_evidence_url,
  manager_achieved_value,  // NEW
}: {
  kpi_id: string;
  manager_rating: RatingLevel;
  manager_score: number;
  manager_remarks: string;
  manager_evidence_url?: string | null;
  manager_achieved_value?: number | null;  // NEW
}) => {
  const { data: updateData, error: submissionError } = await supabase
    .from('review_submissions')
    .update({
      manager_rating,
      manager_score,
      manager_remarks,
      manager_evidence_url,
      manager_achieved_value,  // NEW
      kpi_status: 'approved_by_manager' as const,
    })
    .eq('kpi_id', kpi_id)
    .select();
```

### Change 2: Update Manager Approval Call in EmployeeScorecard

**File**: `src/components/review/EmployeeScorecard.tsx` (Lines 371-377)

Pass the achieved value to the mutation:

```typescript
approveKpi.mutate({
  kpi_id: selectedKpi.id,
  manager_rating: rating,
  manager_score: managerScore,
  manager_remarks: managerRemarks,
  manager_evidence_url: managerEvidenceUrl,
  manager_achieved_value: typeof managerAchievedValue === 'number' 
    ? managerAchievedValue 
    : managerAchievedValue ? parseFloat(managerAchievedValue) : null,  // NEW
});
```

### Change 3: Update `submitAuditReview` Mutation

**File**: `src/components/review/AuditScorecard.tsx` (Lines 198-255)

Add `auditor_achieved_value` to the mutation:

```typescript
mutationFn: async ({
  kpi_id,
  auditor_rating,
  auditor_score,
  auditor_remarks,
  auditor_evidence_url,
  auditor_achieved_value,  // NEW
  approve,
}: {
  // ... existing types ...
  auditor_achieved_value?: number | null;  // NEW
}) => {
  const { data: updateData, error: submissionError } = await supabase
    .from('review_submissions')
    .update({
      auditor_rating,
      auditor_score,
      auditor_remarks,
      auditor_evidence_url,
      auditor_achieved_value,  // NEW
    })
    // ...
```

And pass it in the call (line 420):
```typescript
submitAuditReview.mutate({
  kpi_id: selectedKpi.id,
  auditor_rating: rating,
  auditor_score: auditorScore,
  auditor_remarks: auditorRemarks,
  auditor_evidence_url: auditorEvidenceUrl,
  auditor_achieved_value: typeof auditorAchievedValue === 'number' 
    ? auditorAchievedValue 
    : auditorAchievedValue ? parseFloat(auditorAchievedValue) : null,  // NEW
  approve,
});
```

### Change 4: Update `submitManagementReview` Mutation

**File**: `src/components/review/ManagementScorecard.tsx` (Lines 219-288)

Add `management_achieved_value` to the mutation:

```typescript
mutationFn: async ({
  kpi_id,
  management_rating,
  management_score,
  management_remarks,
  management_evidence_url,
  management_achieved_value,  // NEW
  approve,
}: {
  // ... existing types ...
  management_achieved_value?: number | null;  // NEW
}) => {
  const { data: updateData, error: submissionError } = await supabase
    .from('review_submissions')
    .update({
      management_rating,
      management_score,
      management_remarks,
      management_evidence_url,
      management_achieved_value,  // NEW
      final_rating: management_rating,
      final_score: management_score,
    })
    // ...
```

And pass it in the call (line 442):
```typescript
submitManagementReview.mutate({
  kpi_id: selectedKpi.id,
  management_rating: rating,
  management_score: managementScore,
  management_remarks: managementRemarks,
  management_evidence_url: managementEvidenceUrl,
  management_achieved_value: typeof managementAchievedValue === 'number' 
    ? managementAchievedValue 
    : managementAchievedValue ? parseFloat(managementAchievedValue) : null,  // NEW
  approve,
});
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useKpis.ts` | Add `manager_achieved_value` to `useApproveKpi` mutation |
| `src/components/review/EmployeeScorecard.tsx` | Pass `manager_achieved_value` in approval call |
| `src/components/review/AuditScorecard.tsx` | Add `auditor_achieved_value` to mutation and call |
| `src/components/review/ManagementScorecard.tsx` | Add `management_achieved_value` to mutation and call |
| `DOCUMENTATION.md` | Update documentation |

---

## Data Flow After Fix

```text
Manager enters value → managerAchievedValue state ✅
Manager clicks Approve → approveKpi.mutate({ manager_achieved_value }) ✅
Database update → manager_achieved_value saved ✅
Review Journey → Shows "Value: 15" for Manager ✅
```

---

## Visual Result

### Before
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│    Self     │ │   Manager   │ │   Auditor   │ │ Management  │
│  Value: 15  │ │ Rating: 5   │ │ Rating: 4   │ │  Not Set    │
│  Rating: 0  │ │ No remarks  │ │ No remarks  │ │ No remarks  │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

### After
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│    Self     │ │   Manager   │ │   Auditor   │ │ Management  │
│  Value: 15  │ │  Value: 15  │ │  Value: 15  │ │  Not Set    │
│  Rating: 0  │ │  Rating: 5  │ │  Rating: 4  │ │ No remarks  │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

---

## Validation Checklist

After implementation:
- [ ] Manager submits review → `manager_achieved_value` saved in database
- [ ] Auditor submits review → `auditor_achieved_value` saved in database
- [ ] Management submits review → `management_achieved_value` saved in database
- [ ] Review Journey shows "Value: X" for each level that has submitted
- [ ] Pending levels show no value (correct behavior)
- [ ] N/A KPIs still work correctly
