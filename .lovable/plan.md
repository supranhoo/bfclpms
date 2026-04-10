

## Plan: Add Bulk Zero-Score Button on Employee Dashboard for Admin

### What This Does

Adds a "Zero-Score" action button in the KPI Details header of the UnifiedScorecard (next to KRA Export and Sort controls), visible only to admin users. When clicked, it opens a dialog that lets the admin zero-score all non-submitted KPIs for that specific employee in the selected period — without navigating to the Data Repair tab.

### Design

The feature reuses the existing `bulk-zero-score-non-submitters` edge function, scoping it to a single employee by passing the `employee_id` parameter. The UI follows the same Scan → Select → Confirm ("ZERO") → Execute flow as the existing BulkZeroScoreSection, but in a compact dialog format.

### Changes

#### 1. New Component: `src/components/review/EmployeeBulkZeroScoreDialog.tsx`
- A dialog triggered by a button in the KPI Details header
- Props: `employeeId`, `employeeName`, `reviewPeriod`, `reviewYear`, `open`, `onOpenChange`
- Implements the 3-step flow:
  - **Scan**: Calls the edge function with `mode: 'scan'` + `employee_id` filter to find non-submitted KPIs for this employee only
  - **Select**: Shows results table with checkboxes (pre-selects all zero-scorable)
  - **Execute**: Requires typing "ZERO" to confirm, calls edge function with `mode: 'execute'` + selected KPI IDs
- Includes optional "Include Org KPIs" checkbox
- Admin remarks input field
- Excel export of results
- Invalidates relevant query caches on success

#### 2. Update Edge Function: `supabase/functions/bulk-zero-score-non-submitters/index.ts`
- Add support for an optional `employee_id` parameter in both scan and execute modes
- When `employee_id` is provided, filter KPIs to only that employee (adds `.eq('employee_id', employee_id)` to the query)
- No schema changes needed

#### 3. Update: `src/components/review/UnifiedScorecard.tsx`
- Import `useAuth` already exists — check `effectiveRole` or `role` for `'admin'`
- Add the Zero-Score button (Ban icon) next to KRA Export in the KPI Details CardHeader
- Only render when user role is `'admin'`
- Pass `employee.id`, `employee.full_name`, `selectedPeriod`, `selectedYear` to the dialog

#### 4. Documentation
- `DOCUMENTATION.md`: Add section for employee-level bulk zero-score (v2.33.0)
- `POLICY.md`: Sync version

### Technical Details

```text
KPI Details Header (Admin view):
┌──────────────────────────────────────────────────────────────────┐
│ KPI Details                    [⊘ Zero-Score] [📄 KRA Export] Sort: ... │
│ Click on a KPI to review...                                      │
└──────────────────────────────────────────────────────────────────┘
```

**Edge function filter addition** (scan mode):
```typescript
if (employee_id) {
  query = query.eq('employee_id', employee_id);
}
```

**Admin role check** in UnifiedScorecard:
```typescript
const { user, role } = useAuth();
const isAdmin = role === 'admin';
```

### Risk Assessment
- **Data impact**: None — reuses existing edge function with additive filter
- **Regression risk**: Low — new optional parameter, existing behavior unchanged when not provided
- **Security**: Admin-only — edge function already validates admin via `requireAdminUser()`
- **UI/UX**: Button only visible to admins; does not affect non-admin views

