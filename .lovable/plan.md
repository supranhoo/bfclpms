

## Plan: Add Step-Back Button to KPI Details View (Admin Only)

### Approach
Add a "Step Back" button in the `KpiHeaderSection` component — alongside the existing "Admin KPI Editor" and "Admin Data Entry" buttons — visible only to admin users. This places the step-back action on the KPI details view page, not on the table listing.

### Changes

**1. `src/components/review/KpiHeaderSection.tsx`**
- Import `Undo2` icon, `AdminStatusStepBackDialog`, and `getPreviousStatus`
- Add `stepBackDialogOpen` state
- Add a "Step Back" button in the admin button row (lines 188-207), conditionally shown when `getPreviousStatus(kpi.status)` returns a valid target
- Render `AdminStatusStepBackDialog` inside the admin dialogs block (lines 212-228)
- The dialog is self-contained — it fetches workflow stages internally, only needs `kpiId`, `kpiName`, `kraName`, `employeeId`, `employeeName`, `currentStatus`

**2. `DOCUMENTATION.md`** — v2.15.51 entry

### Visual Result
```text
Admin buttons row (bottom of KPI header):
  [⚙ Admin KPI Editor]  [📋 Admin Data Entry]  [↩ Step Back]
                                                  ^^^ NEW
```
The Step Back button only appears when there is a valid previous status to go back to.

### Risk
- Low — additive; no changes to existing logic or non-admin views
- Uses the already-implemented `AdminStatusStepBackDialog` component

