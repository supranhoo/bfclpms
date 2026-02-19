
# Root Cause Analysis: Why Vivek Sees Fewer Pending KPIs Than Admin

## What the Data Reveals

After deep investigation of the database, code, and RLS policies, there are **3 distinct bugs** causing Vivek to see fewer pending KPIs than expected. Here is the full breakdown.

---

## Understanding the "161" vs Vivek's Count

The 161 KPIs the admin sees as "pending" are spread across **multiple review periods**:

| Period | Template | Pending Status | Count |
|---|---|---|---|
| January 2026 | `self_l1_hr_pms` (9 employees) | `manager_check` | 58 |
| January 2026 | Default template (397 employees) | `skip_level_check` | 74 |
| January 2026 | `self_l1_l2_hr_pms` (8 employees) | `skip_level_check` | 29 |
| February 2026 | `self_l1_hr_pms` | `manager_check` | 4 |
| **TOTAL** | | | **~165 ≈ 161** |

Vivek opens the dashboard and sees **February 2026** (current month) by default. In February 2026, there are only **4 pending KPIs** for the HR PMS role — not 161.

---

## Bug 1: `useKpisByPeriod` Only Covers a Single Month

**Location:** `src/components/review/EmployeeSelectorGrid.tsx` line 147

```typescript
const { data: periodKpis } = useKpisByPeriod(selectedPeriod, selectedYear);
```

`selectedPeriod` = `periodSelection.selectedMonth` — this is always a **single month string**, even when the user switches the mode to YTD or QTD. The `periodSelection` object has a `periodRanges` array containing all months in the selected range, but `useKpisByPeriod` ignores this entirely.

**Impact:** In YTD mode (January + February 2026), the stats still only count KPIs from February 2026. The admin may have been viewing YTD/custom mode showing all periods, while Vivek defaults to single month (February) which has only 4 pending items.

**Fix:** Change `useKpisByPeriod` to accept `periodRanges: Array<{ month: string; year: number }>` and fetch all KPIs across ALL ranges in a single OR-condition query — instead of just a single `review_period` + `review_year` filter. The `EmployeeSelectorGrid` should pass `periodSelection.periodRanges` to this hook.

---

## Bug 2: `workflowMap` Misses Employees with No KPIs in Selected Period

**Location:** `src/components/review/EmployeeSelectorGrid.tsx` lines 150–160

```typescript
const allEmployeeIds = useMemo(() => {
  if (!periodKpis) return [];
  return [...new Set(periodKpis.map(k => k.employee_id))];
}, [periodKpis]);

const { data: workflowMap } = useBulkEmployeeWorkflows(allEmployeeIds);

const getStages = (employeeId: string): string[] => {
  return workflowMap?.get(employeeId) || DEFAULT_WORKFLOW_STAGES;
};
```

`DEFAULT_WORKFLOW_STAGES` is:
```typescript
['kra_set', 'self_review', 'manager_check', 'audit', 'management_review', 'approved']
```

This does **NOT include `hr_pms_review`**. So any employee shown in the `stageFilteredProfiles` list (who does have `hr_pms_review` in their template) but has **no KPIs in the currently selected period** will fall back to `DEFAULT_WORKFLOW_STAGES` → `resolveReviewableStatuses('hr_pms', DEFAULT_WORKFLOW_STAGES)` returns `[]` → they show **0 pending KPIs** even if they have pending KPIs in other periods.

**Fix:** The `allEmployeeIds` passed to `useBulkEmployeeWorkflows` should be derived from **`stageFilteredProfiles`** (the full list of employees visible in the panel) — not just from employees who happen to have KPIs in the selected period. This ensures every employee shown in the grid has their accurate workflow stages resolved.

---

## Bug 3: `useKpisByPeriod` Has a 1000-Row Supabase Limit — But `workflowMap` Doesn't Paginate

**Location:** `src/hooks/useKpis.ts` — `useKpisByPeriod` does paginate (correctly), but `useBulkEmployeeWorkflows` only runs for the IDs it receives. If `allEmployeeIds` is missing employees (due to Bug 2), the bulk RPC call never resolves stages for those employees.

This is downstream of Bug 2 — fixing Bug 2 fixes this automatically.

---

## Complete Fix Plan

### Fix 1: Make `useKpisByPeriod` support multi-period ranges

**File:** `src/hooks/useKpis.ts`

Add a new hook `useKpisByPeriodRanges(periodRanges)` that accepts `Array<{ month: string; year: number }>` and fetches KPIs with an `OR` across all period/year combinations using batched queries. This is the definitive fix for the single-month limitation.

### Fix 2: Derive `allEmployeeIds` from `stageFilteredProfiles` instead of `periodKpis`

**File:** `src/components/review/EmployeeSelectorGrid.tsx` lines 150–153

```typescript
// BEFORE (Bug 2):
const allEmployeeIds = useMemo(() => {
  if (!periodKpis) return [];
  return [...new Set(periodKpis.map(k => k.employee_id))];
}, [periodKpis]);

// AFTER (Fix):
const allEmployeeIds = useMemo(() => {
  // Use the full list of visible employees (stageFilteredProfiles or allProfiles/teamMembers)
  // to ensure workflowMap has stages for ALL employees, not just those with KPIs this period
  const source = requiredStage ? stageFilteredProfiles : (isFullAccess ? allProfiles : teamMembers);
  if (!source) return [];
  return source.map(p => p.id);
}, [requiredStage, stageFilteredProfiles, allProfiles, teamMembers, isFullAccess]);
```

### Fix 3: Use `useKpisByPeriodRanges` in `EmployeeSelectorGrid`

**File:** `src/components/review/EmployeeSelectorGrid.tsx`

Replace `useKpisByPeriod(selectedPeriod, selectedYear)` with the new multi-period hook `useKpisByPeriodRanges(periodSelection.periodRanges)`. This ensures the stats and status filters correctly reflect all months when the user is in YTD, QTD, or Custom mode.

---

## Files to Modify

| File | Change |
|---|---|
| `src/hooks/useKpis.ts` | Add `useKpisByPeriodRanges(periodRanges)` hook that batches multi-period KPI fetches |
| `src/components/review/EmployeeSelectorGrid.tsx` | (1) Derive `allEmployeeIds` from the full visible employee list, not periodKpis; (2) Replace `useKpisByPeriod` with `useKpisByPeriodRanges`; pass `periodSelection.periodRanges` |
| `DOCUMENTATION.md` | Version bump to 1.45.22 |

---

## What Changes for Vivek After the Fix

| Scenario | Before | After |
|---|---|---|
| Vivek views Feb 2026 (single month) | 4 pending KPIs | 4 pending KPIs (correct — only 4 exist in Feb) |
| Vivek switches to YTD (Jan + Feb) | Still shows 4 (bug — only Feb counted) | ~165 pending across both months (correct) |
| Vivek switches to January 2026 | Some KPIs visible, but some employees show 0 due to workflowMap miss | All employees show correct pending counts |
| Vivek's employee card badges | Some employees show 0 pending due to missing workflowMap entry | All employees show correct pending badge counts |

---

## Important Clarification

The "161" the admin sees is **correct data** — it's just spanning multiple months (primarily January 2026). It is **not a permissions bug** — Vivek has full RLS access to all KPIs. The issue is purely a **UI/data-loading gap**: single-month fetch when multi-month display is active, and workflow stage resolution only for employees who happen to have KPIs in the selected period.
