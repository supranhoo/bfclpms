
# Fix: Observations — Admin Access & All Manager-Level Roles

## Root Cause Analysis

### Issue 1: Jaspal (Admin) Cannot Add Observation
Jaspal's role is `admin`. The `canAddObservation` function in `KpiObservationsSection.tsx` checks:

```ts
function canAddObservation(viewLevel: string, _kpiStatus: string, isOwnKpi: boolean): boolean {
  if (isOwnKpi) return true;
  return ['manager', 'skip_level', 'hr_pms', 'auditor', 'management'].includes(viewLevel);
}
```

`'admin'` is **not in this list**. So for Jaspal reviewing Avinash's KPI, `isOwnKpi` is `false` (it's not his KPI), and `viewLevel` for an admin is not `'admin'` in the union type — the component's `viewLevel` prop is typed as `'employee' | 'manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms'`. The admin reviewing via the All KPIs page does not even render a `KpiObservationsSection` — there's no observations panel in the Admin Data Entry Dialog.

Additionally, if admins access observations through the normal scorecard, `admin` is not part of the `getObserverRole` switch — it falls to `default: return 'self'`, making admin appear as a self-reviewer on someone else's KPI.

### Issue 2: RLS INSERT Policy Missing `hr_pms` Role
The current INSERT policy for `kpi_observations` is:
```sql
(created_by = auth.uid()) AND (
  EXISTS (SELECT 1 FROM kpis WHERE kpis.id = kpi_observations.kpi_id AND kpis.employee_id = auth.uid())
  OR has_role(auth.uid(), 'manager')
  OR has_role(auth.uid(), 'auditor')
  OR has_role(auth.uid(), 'management')
  OR has_role(auth.uid(), 'admin')
)
```
`hr_pms` role is **missing** from this list. An HR PMS user cannot insert observations at the database level even though the UI shows them the button.

### Issue 3: `getObserverRole` Falls Back to `'self'` for Admin
In `getObserverRole`, any `viewLevel` not explicitly listed defaults to `'self'`. This means even if an admin sees the Add button, the inserted record marks their role as `'self'` instead of `'admin'`.

## Fixes Required

### Fix 1: Update RLS INSERT Policy — Add `hr_pms` role
Update the INSERT policy on `kpi_observations` to include `hr_pms`:

```sql
DROP POLICY "Users can create observations" ON public.kpi_observations;

CREATE POLICY "Users can create observations"
ON public.kpi_observations FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid() AND (
    EXISTS (SELECT 1 FROM kpis WHERE kpis.id = kpi_observations.kpi_id AND kpis.employee_id = auth.uid())
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'auditor')
    OR has_role(auth.uid(), 'management')
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'hr_pms')
    OR has_role(auth.uid(), 'skip_level')
  )
);
```

### Fix 2: Update `canAddObservation` — Always Allow for All Non-Employee Reviewer Levels
The function should allow observations for ALL reviewer levels. Since the `viewLevel` prop covers all review roles and admins access the scorecard through Dashboard, the fix is to make `canAddObservation` return `true` for any `viewLevel` that is not `'employee'` viewing someone else's KPI:

```ts
function canAddObservation(viewLevel: string, _kpiStatus: string, isOwnKpi: boolean): boolean {
  // Employees can always add to their own KPIs
  if (isOwnKpi) return true;
  // All reviewer roles can add observations
  return ['manager', 'skip_level', 'hr_pms', 'auditor', 'management'].includes(viewLevel);
}
```

This is already correct for the listed roles — but we need to also ensure `admin` access works when the viewLevel is mapped correctly.

### Fix 3: Update `getObserverRole` — Handle Admin View Level
Extend the switch to handle admin correctly. Since `viewLevel` union type doesn't include `'admin'`, we need to either:
- Extend the `viewLevel` type to include `'admin'`
- Or add a fallback that recognizes when the reviewer is an admin

The cleanest fix: extend the union type in `KpiObservationsSection` to accept `'admin'` as a valid `viewLevel`, add it to `getObserverRole`, and add it to `canAddObservation`:

```ts
// In KpiObservationsSection props
viewLevel: 'employee' | 'manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms' | 'admin';

function getObserverRole(viewLevel: string, isOwnKpi: boolean): ObserverRole {
  if (isOwnKpi && viewLevel === 'employee') return 'self';
  switch (viewLevel) {
    case 'manager': return 'manager';
    case 'skip_level': return 'manager';
    case 'hr_pms': return 'manager';
    case 'auditor': return 'auditor';
    case 'management': return 'management';
    case 'admin': return 'admin';
    default: return 'self';
  }
}

function canAddObservation(viewLevel: string, isOwnKpi: boolean): boolean {
  if (isOwnKpi) return true;
  return ['manager', 'skip_level', 'hr_pms', 'auditor', 'management', 'admin'].includes(viewLevel);
}
```

### Fix 4: Ensure `KpiReviewPanel` Propagates Admin View Level
`KpiReviewPanel` accepts `viewLevel: ViewLevel` where `ViewLevel = 'employee' | 'manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms'`. This type needs `'admin'` added so it can be passed through correctly when an admin uses the scorecard view.

## Files to Modify

| File | Change |
|---|---|
| **Database Migration** | Drop and recreate `kpi_observations` INSERT policy to add `hr_pms` and `skip_level` roles |
| `src/components/review/KpiObservationsSection.tsx` | Add `'admin'` to viewLevel union type; update `getObserverRole` and `canAddObservation` to handle admin |
| `src/components/review/KpiReviewPanel.tsx` | Add `'admin'` to `ViewLevel` type |
| `DOCUMENTATION.md` | Version bump to 1.45.28 |

## Expected Outcome

- Jaspal (admin) can add observations on Avinash's KPI — the button is visible and the insert succeeds at the database level
- HR PMS users can successfully insert observations (database RLS fixed)
- All reviewer-level roles (manager, skip_level, hr_pms, auditor, management, admin) can add observations
- Observer role is correctly recorded as `'admin'` for admin users instead of `'self'`
- No change to existing employee (self) observation behavior
