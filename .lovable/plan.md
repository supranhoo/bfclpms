

# Plan: Fix "Add Observation" Button Visibility

## Problem Analysis

The "Add Observation" button is not appearing due to two issues:

| Issue | Location | Current State |
|-------|----------|---------------|
| `isOwnKpi` hardcoded to `false` | Line 102 of `KpiObservationsSection.tsx` | Employee's own KPI check never works |
| `kra_set` excluded from manager permissions | Lines 63-66 of `KpiObservationsSection.tsx` | Manager can't add observations for KPIs in "KRA Set" status |

The screenshot shows:
- **viewLevel**: `manager` (Team Review page)
- **kpiStatus**: `kra_set`
- **Result**: `canAddObservation()` returns `false` because `kra_set` is not in the allowed list

---

## Solution

### 1. Pass `isOwnKpi` Prop from Parent

Update `KpiObservationsSection` to accept `isOwnKpi` as a prop and pass it from `KpiReviewPanel`.

### 2. Allow Observations at All Pre-Approved Stages

Update `canAddObservation()` to allow managers, auditors, and management to add observations at **any stage before approved**, not just specific workflow stages. This aligns with the use case of "tagging findings during the month."

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/review/KpiObservationsSection.tsx` | Add `isOwnKpi` prop, update `canAddObservation` logic |
| `src/components/review/KpiReviewPanel.tsx` | Pass `isOwnKpi` prop to `KpiObservationsSection` |
| `DOCUMENTATION.md` | Update observation permission rules |

---

## Technical Implementation

### 1. Update KpiObservationsSection Props

```typescript
interface KpiObservationsSectionProps {
  kpiId: string;
  kpiStatus: string;
  viewLevel: 'employee' | 'manager' | 'auditor' | 'management';
  baseScore?: number | null;
  isOwnKpi?: boolean;  // NEW: Pass from parent
}
```

### 2. Simplify canAddObservation Logic

**Current (restrictive):**
```typescript
function canAddObservation(viewLevel: string, kpiStatus: string, isOwnKpi: boolean): boolean {
  if (kpiStatus === 'approved') return false;
  if (isOwnKpi) return true;
  
  switch (viewLevel) {
    case 'manager':
      return ['self_review', 'manager_check', 'audit', 'management_review'].includes(kpiStatus);
    case 'auditor':
      return ['manager_check', 'audit', 'management_review'].includes(kpiStatus);
    case 'management':
      return ['audit', 'management_review'].includes(kpiStatus);
    default:
      return false;
  }
}
```

**Updated (permissive for reviewers):**
```typescript
function canAddObservation(viewLevel: string, kpiStatus: string, isOwnKpi: boolean): boolean {
  // Can't add after approved
  if (kpiStatus === 'approved') return false;
  
  // Self can always add for their own KPIs
  if (isOwnKpi) return true;
  
  // All reviewers can add observations at any pre-approved stage
  // This allows tagging findings throughout the review month
  return ['manager', 'auditor', 'management'].includes(viewLevel);
}
```

### 3. Update KpiReviewPanel to Pass isOwnKpi

```typescript
interface KpiReviewPanelProps {
  kpi: KPI;
  // ... existing props
  currentUserId?: string;  // NEW: To determine if viewing own KPI
}

// In the component:
const isOwnKpi = currentUserId ? kpi.employee_id === currentUserId : false;

<KpiObservationsSection
  kpiId={kpi.id}
  kpiStatus={kpi.status || 'kra_set'}
  viewLevel={viewLevel}
  baseScore={submission?.final_score ?? submission?.self_score ?? null}
  isOwnKpi={isOwnKpi}
/>
```

### 4. Update EmployeeScorecard to Pass currentUserId

```typescript
<KpiReviewPanel
  kpi={selectedKpi}
  submission={...}
  viewLevel="manager"
  currentUserId={user?.id}
  // ... other props
/>
```

---

## Updated Permission Matrix

| Role | Can Add Observations When |
|------|--------------------------|
| **Self (Employee)** | Own KPI, any status before `approved` |
| **Manager** | Any subordinate KPI, any status before `approved` |
| **Auditor** | Any accessible KPI, any status before `approved` |
| **Management** | Any accessible KPI, any status before `approved` |

---

## Testing Checklist

- [ ] Manager sees "Add Observation" button for KPI in `kra_set` status
- [ ] Manager sees button for `self_review`, `manager_check`, `audit`, `management_review`
- [ ] Manager does NOT see button for `approved` KPIs
- [ ] Auditor sees button for all pre-approved KPIs
- [ ] Management sees button for all pre-approved KPIs
- [ ] Employee sees button for their own KPIs (when accessed via My KPIs)
- [ ] Adding an observation works correctly
- [ ] Observation appears in the list after creation

