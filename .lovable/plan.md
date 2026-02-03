

# Plan: Fix Self Observation Addition in My KPIs Page

## Problem Analysis

The "Add Observation" button is not visible on the **My KPIs** page because `currentUserId` is not being passed to the `KpiReviewPanel` component.

| Location | Issue |
|----------|-------|
| `src/pages/MyKpis.tsx` (line 811-821) | `KpiReviewPanel` is called without `currentUserId` prop |
| `src/components/review/KpiReviewPanel.tsx` (line 45) | `isOwnKpi` evaluates to `false` when `currentUserId` is undefined |

**Current code** (line 811-821 in MyKpis.tsx):
```typescript
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
```

**Missing**: `currentUserId={profile?.id}`

---

## Solution

Add `currentUserId={profile?.id}` to the `KpiReviewPanel` in `MyKpis.tsx`. The `profile` object is already available via `useAuth()` on line 82.

---

## Technical Implementation

### File: `src/pages/MyKpis.tsx`

**Change** (around line 811-821):

```typescript
<KpiReviewPanel
  kpi={selectedKpi}
  submission={submissionMap.get(selectedKpi.id) || null}
  allKpis={allKpis || []}
  allSubmissions={submissions || []}
  viewLevel="employee"
  currentUserId={profile?.id}  // ADD THIS LINE
  selectedPeriod={selectedPeriod}
  selectedYear={selectedYear}
  onOpenFullHistory={() => setTrackerModalOpen(true)}
/>
```

---

## Permission Flow After Fix

```text
MyKpis.tsx
    │
    ├── profile?.id (from useAuth)
    │
    └── KpiReviewPanel
            │
            ├── currentUserId = profile.id
            │
            └── isOwnKpi = (currentUserId === kpi.employee_id) = TRUE
                    │
                    └── KpiObservationsSection
                            │
                            └── canAddObservation() = TRUE
                                    │
                                    └── "Add Observation" button VISIBLE ✓
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/MyKpis.tsx` | Add `currentUserId={profile?.id}` to KpiReviewPanel |

---

## Testing Checklist

- [ ] Navigate to My KPIs page
- [ ] Open any KPI in the sheet
- [ ] Verify "Add Observation" button appears in the Observations section
- [ ] Click "Add Observation" and confirm dialog opens
- [ ] Submit an observation and verify it appears in the list
- [ ] Verify the observation shows "Self" as the role
- [ ] Verify the observation shows "Pending" status (not auto-applied)

