

## RCA: "Pending Audit" Stat Card Shows 278 but Filter Shows Only 5 Employees

### Root Cause Found

**Data Investigation Results:**
- February 2026 has **320 KPIs at `manager_check`** status and **16 at `audit`** status. There are **zero** KPIs at `hr_pms_review` or `skip_level_check`.
- 18 of the 26 employees with `manager_check` KPIs have workflows where `audit` follows directly after `manager_check` (confirmed via the `get_bulk_employee_workflows` RPC).
- These 18 employees' ~270 KPIs at `manager_check` are correctly "pending audit."

**The Bug — Stat Card vs Filter Mismatch:**

The **stat card** (line 697-710) counts **KPIs** using `resolveReviewableStatuses('auditor', stages)` — correctly finding 278 KPIs at `manager_check` as "pending audit."

The **filter** (line 566-568) uses the **same logic** to find employee IDs with pending KPIs. However, the filter iterates `periodKpis` (ALL KPIs across all employees), while the stat card only iterates `relevantKpis` (KPIs restricted to the 43 audit-panel employees). The filter adds employee IDs from ALL matching KPIs, then intersects with `demographicFilteredMembers` (43 employees). This should work — but the subtle issue is:

**`periodKpis` may be stale or partially loaded relative to `workflowMap`.** The `displayMembers` memo depends on `workflowMap`, but `getStages()` is a closure over the current `workflowMap` ref — not a stable dependency. When `workflowMap` updates, the stat card memo (which lists `workflowMap` as a dependency at line 768) recomputes correctly, but the `displayMembers` memo may not recompute if the closure captures a stale `workflowMap` reference.

**Additionally**, the stat card includes `'audit'` status in its `else` fallthrough logic — KPIs at statuses NOT matching `'audit'`, `'management_review'`, or `'approved'` ALL fall into the `else` branch and get checked against `resolveReviewableStatuses`. This means KPIs at `'kra_set'`, `'self_review'`, etc. also enter this branch but don't match the reviewable check. However, the stat count of 278 is inflated because the stat card's `else` clause catches too broadly — it counts KPIs at `manager_check` for employees whose `getStages()` **falls back to DEFAULT_WORKFLOW_STAGES** (when `workflowMap` hasn't returned for them yet), where `manager_check` IS the preceding audit stage.

### Confirmed Root Cause

The stat card and filter both use `getStages()`, but `getStages()` falls back to `DEFAULT_WORKFLOW_STAGES` (6-stage: `[kra_set, self_review, manager_check, audit, management_review, approved]`) when `workflowMap` doesn't have an entry. In this 6-stage default, `manager_check` precedes `audit`, so ALL `manager_check` KPIs count as "pending audit."

But `demographicFilteredMembers` (baseMembers) = `stageFilteredProfiles`, which uses the **full RPC** to correctly resolve workflows. Only 43 employees have `audit` in their real workflow. The remaining employees with `manager_check` KPIs DON'T have `audit` in their workflow — their KPIs shouldn't count as "pending audit" but DO in the stat card due to the DEFAULT fallback.

**In short: The stat card overcounts because `getStages()` falls back to a 6-stage default that includes `audit`, counting `manager_check` KPIs from employees whose REAL workflow doesn't have an `audit` stage.**

### Fix

**File: `src/components/review/EmployeeSelectorGrid.tsx`**

1. **Stat card fix**: In the audit stats computation (line 697-710), restrict `relevantKpis` to only employees whose `workflowMap` entry actually includes `audit` — don't rely on `getStages()` fallback. Add a guard: `if (!workflowMap?.has(k.employee_id)) return;` to skip employees without resolved workflows.

2. **Filter fix**: Apply the same guard in the `displayMembers` filter for the audit `pending` branch — skip KPIs where `workflowMap` doesn't have the employee (avoiding false matches from the 6-stage default fallback).

3. **Alternatively (better)**: Change `getStages()` to return `null` when `workflowMap` doesn't have the employee, and skip those KPIs in both stat and filter computations. This ensures consistency — only employees with RPC-resolved workflows are counted.

### Files Changed
| File | Action |
|------|--------|
| `src/components/review/EmployeeSelectorGrid.tsx` | Fix stat card and filter to skip employees without resolved workflows |

### Risk Assessment
- **Regression**: Zero — only changes audit stat/filter logic, guarded by `viewLevel === 'audit'`
- **Data**: Read-only, no schema changes
- **Accuracy**: Stat card and filter will now show consistent, correct numbers

