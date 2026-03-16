

# RCA: Workflow Config for Employee 200416 Not Effective on Dashboard

## Root Cause

The database is correct — calling `get_employee_workflow('e97cb9a7-...', 'March', 2026)` returns the expected 6-stage workflow (`self_l1_hr_pms_audit`).

The previous fix only patched **2 of 6** components. Four scorecard/review components still call `useEmployeeWorkflowStages(employee.id)` **without period parameters**, causing them to resolve the global fallback instead of the March-specific config.

| Component | Line | Has period props? | Passes them? |
|---|---|---|---|
| `UnifiedScorecard.tsx` | 193 | Yes | **Yes** ✅ (fixed earlier) |
| `EmployeeSelectorGrid.tsx` | 173 | Yes | **Yes** ✅ (fixed earlier) |
| `EmployeeScorecard.tsx` | 90 | Yes (`selectedPeriod`, `selectedYear`) | **No** ❌ |
| `AuditScorecard.tsx` | 98 | Yes | **No** ❌ |
| `ManagementScorecard.tsx` | 92 | Yes | **No** ❌ |
| `SelfReviewSheet.tsx` | 127 | Yes | **No** ❌ |
| `AdminDataEntryDialog.tsx` | 108 | No (has KPI with period) | **No** ❌ |

## Fix: 5 one-line changes

**1. `src/components/review/EmployeeScorecard.tsx` line 90:**
```diff
- const { data: workflowStages } = useEmployeeWorkflowStages(employee.id);
+ const { data: workflowStages } = useEmployeeWorkflowStages(employee.id, selectedPeriod, selectedYear);
```

**2. `src/components/review/AuditScorecard.tsx` line 98:**
```diff
- const { data: workflowStages } = useEmployeeWorkflowStages(employee.id);
+ const { data: workflowStages } = useEmployeeWorkflowStages(employee.id, selectedPeriod, selectedYear);
```

**3. `src/components/review/ManagementScorecard.tsx` line 92:**
```diff
- const { data: workflowStages } = useEmployeeWorkflowStages(employee.id);
+ const { data: workflowStages } = useEmployeeWorkflowStages(employee.id, selectedPeriod, selectedYear);
```

**4. `src/components/review/SelfReviewSheet.tsx` line 127:**
```diff
- const { data: employeeWorkflowStages, isLoading: stagesLoading } = useEmployeeWorkflowStages(profile?.id);
+ const { data: employeeWorkflowStages, isLoading: stagesLoading } = useEmployeeWorkflowStages(profile?.id, selectedPeriod, selectedYear);
```

**5. `src/components/admin/AdminDataEntryDialog.tsx` line 108:**
Extract period from the KPI prop and pass it:
```diff
+ const kpiPeriod = kpi ? { month: kpi.review_period || 'January', year: kpi.review_year || new Date().getFullYear() } : null;
- const { data: workflowStages } = useEmployeeWorkflowStages(employeeId);
+ const { data: workflowStages } = useEmployeeWorkflowStages(employeeId, kpiPeriod?.month, kpiPeriod?.year);
```

## Impact

All 6 consumer components will pass period context to the RPC, ensuring period-specific workflow overrides (like the one for employee 200416) are correctly resolved everywhere — scorecards, self-review, audit, management review, and admin data entry.

