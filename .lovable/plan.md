

## Root Cause Analysis: Final Score Showing 5 When Auditor & Management Gave 0

### Problem
The "Final" column in the KPI scorecard table displays `5` even when Auditor and Management both scored `0`.

### Root Cause

There are **two contributing issues**:

**1. Import sets `final_score` prematurely (Primary Cause)**
In `supabase/functions/import-kpis/index.ts` (line 918), the bulk import logic sets `final_score` from the first available score during import:
```typescript
final_score: row.auditRating ?? row.managerRating ?? row.employeeRating ?? row.rating ?? null
```
This means `final_score = 5` (from self-review) gets written to the database during import, **before** any reviewer has actually approved the KPI.

**2. Intermediate review stages never clear stale `final_score`**
In `UnifiedScorecard.tsx` (line 565-570), `final_score` is only updated when the **terminal reviewer approves** (`approve && config.forwardStatus === 'approved'`). When an auditor or management reviewer **saves a score of 0** without being the terminal approver, the stale `final_score = 5` from import persists untouched.

**3. Display reads `final_score` unconditionally**
In `KpiDetailsTable.tsx` (line 123-124), the "Final" column reads `submission.final_score ?? null` regardless of KPI status. It shows the stale imported value even when the KPI is still in `audit` or `management_review` status.

### Fix Plan

**Fix 1: Clear `final_score` during intermediate review stages** (`UnifiedScorecard.tsx`)
When any reviewer submits a score and the KPI is NOT moving to `approved`, clear `final_score` and `final_rating` to prevent stale values:
```typescript
// After setting stage-specific score fields
if (!(approve && config.forwardStatus === 'approved')) {
  updateData.final_score = null;
  updateData.final_rating = null;
}
```

**Fix 2: Fix import to NOT set `final_score` unless status is `approved`** (`import-kpis/index.ts`)
Only set `final_score` when the imported KPI's status resolves to `approved`:
```typescript
final_score: isNa ? null : (status === 'approved' ? (row.auditRating ?? row.managerRating ?? row.employeeRating ?? row.rating ?? null) : null),
```

**Fix 3: Guard display in `KpiDetailsTable.tsx`**
Only show `final_score` when KPI status is `approved`:
```typescript
case 'final_score':
  return kpiStatus === 'approved' ? (submission.final_score ?? null) : null;
```
This requires passing `kpiStatus` into the `getScoreForColumn` function.

**Fix 4: Admin data entry step-back already clears `final_score`** (line 577-579 in `useAdminDataEntry.ts`) — this is correct and needs no change.

### Files to Change

| File | Change |
|------|--------|
| `src/components/review/UnifiedScorecard.tsx` | Clear `final_score`/`final_rating` when forwarding to non-approved status |
| `src/components/review/KpiDetailsTable.tsx` | Only display `final_score` when KPI is approved |
| `supabase/functions/import-kpis/index.ts` | Only set `final_score` when import status = approved |

### Impact
- Existing stale `final_score` values in the DB will be hidden by the display guard (Fix 3) immediately
- Future reviews will clear stale values proactively (Fix 1)
- Future imports will not create stale values (Fix 2)

