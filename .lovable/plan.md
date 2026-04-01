

## RCA & Plan: Admin Step-Back from Approved + Data Deletion for Approved KPIs

### Current State

**Step-Back from Approved already works** — the step-back button in Admin KPI Dashboard is shown for all statuses including `approved` (since `getPreviousStatus('approved')` returns the terminal workflow stage). The cascade-clear logic already nullifies `final_score`/`final_rating` and clears downstream reviewer fields.

**Two gaps exist:**

### Gap 1: Step-back only goes one level back
The dialog auto-selects the previous stage with no option to choose a specific target level. For approved KPIs, the admin may want to send back to `kra_set` (employee re-entry) or `manager_check`, not just the terminal stage.

### Gap 2: No "delete/reset all data" option for test KPIs
There is no mechanism to fully wipe all review submission data (scores, remarks, evidence, achieved values) and reset a KPI to `kra_set` with a clean slate. This is needed for removing test data.

### Gap 3: Multi-month sibling handling
When an approved multi-month KPI is stepped back, its percolated sibling months remain `approved`. The step-back must also revert siblings.

---

### Plan

**1. Enhance `AdminStatusStepBackDialog` — Add target stage selector**

Replace the fixed "previous status" display with a `Select` dropdown listing all workflow stages that precede the current status. Admin picks exactly where to send it back.

- Compute `availableTargets`: all stages in the employee's workflow with index < current index, plus `kra_set` always included
- Default selection: immediate previous stage (current behavior)
- The existing cascade-clear logic in `useAdminStatusStepBack` already handles arbitrary target stages correctly

**2. Add "Reset All Data" option in the step-back dialog**

Add a checkbox: "Clear all review data (full reset)" — when checked:
- Target is forced to `kra_set`
- ALL submission fields are nullified (every score, rating, remark, evidence, achieved value)
- `kpi_status` set to `open` on the `kpis` table
- Audit log records `ADMIN_FULL_RESET` action

**3. Handle multi-month siblings on step-back from approved**

In `useAdminStatusStepBack`, after updating the primary KPI:
- If the KPI has a multi-month frequency AND current status is `approved`
- Query sibling KPIs in the same cycle (same employee, kra_name, kpi_name, review_year, frequency, different review_period)
- Apply the same status change and cascade-clear to each sibling
- Log `SIBLING_STEP_BACK` audit entry for each

**4. Update `DOCUMENTATION.md` and `POLICY.md`**

---

### Files Modified

| File | Change |
|------|--------|
| `src/components/admin/AdminStatusStepBackDialog.tsx` | Add target stage `Select` dropdown + "Full Reset" checkbox |
| `src/hooks/useAdminDataEntry.ts` | Add multi-month sibling handling in step-back; add full-reset logic |
| `DOCUMENTATION.md` | v2.15.50 |
| `POLICY.md` | Update step-back policy for target selection and full reset |

### Risk
- Low — step-back already works; we're adding a target selector and sibling handling
- Full reset is guarded by explicit checkbox + confirmation
- Sibling revert uses same cascade-clear logic already proven for single KPIs

