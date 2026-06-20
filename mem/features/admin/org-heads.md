---
name: Org Heads (BU, Department & HR head mapping)
description: Admin-managed BU / Department / HR heads used by Annual Review reviewer chain; auto-resolved from top of hierarchy with manual override
type: feature
---

## Storage
- `business_units.head_user_id` (+ `head_source` 'auto'|'manual', `head_updated_at`, `head_updated_by`).
- `departments.head_user_id` (+ same head_source/head_updated_at/head_updated_by set,
  added 2026-06-20 — exact mirror of the BU columns).
- HR head = `business_units.head_user_id` of the BU named `HR` (case-insensitive)
  within the cycle's company (BU → division → company). No separate config row.
- `org_head_config` table still exists but is **deprecated and unused** by app code
  (left in place to avoid destructive migration; safe to drop later).
- `annual_review_instances.dept_head_id` snapshots the Department head at seed
  time alongside `bu_head_id` / `hr_id` / `manager_id` / `skip_id`.

## Resolver SSOT
- `public.resolve_bu_head(p_bu_id)` — top of reporting hierarchy among ACTIVE
  candidates. Candidate scope = employees whose department is in the BU, PLUS
  division-level employees (department name = division name, within the same
  division — covers cross-BU division heads like Sajid in dept "DRI" leading
  both 1050 TPD and 3X100 TPD). Roots = candidate whose `reporting_manager_id`
  is NULL or outside the candidate set. Tie-break: **level seniority**
  (M0=0 … M7=7, W1=8 … W5=12, NULL/unknown=99) ASC, then `doj` ASC NULLS LAST,
  then `id`. (`departments` has no `division_id`; division is reached via
  `business_units.division_id`. `levels.rank` does not exist.)
- `public.resolve_department_head(p_dept_id)` — same hierarchy + tie-break, but
  scope is ACTIVE non-dummy employees with `profiles.department_id = p_dept_id`
  (department-only; no BU/division fallback).
- HR head resolution lives in `src/services/orgHeads/hrHeadResolver.ts`
  (`getHrHeadUserId(companyId)`); the DB `resolve_hr_head` RPC is no longer called.

## RPCs (admin / hr_pms only, audit-logged as `org_heads.*`)
- `set_bu_head(bu_id, user_id, reason)` — manual override, reason >=3 chars.
- `recalculate_bu_head(bu_id)` — re-derives via resolver, flips source back to 'auto'.
- `set_department_head(dept_id, user_id, reason)` / `recalculate_department_head(dept_id)`
  — mirror of the BU mutations; audit actions `org_heads.dept_head_set` /
  `org_heads.dept_head_recalculated`.
- `set_hr_department`, `set_hr_head`, `recalculate_hr_head` — deprecated, no UI callers.

## UI
- BU Head and HR Head live **inline on the Business Units tab** as a "Head"
  column (Auto/Manual badge + recalculate / change buttons per row). The HR
  head is simply the head of the BU named "HR" — no separate HR Finalization tab.
- Department Head lives **inline on the Departments tab** as the same "Head" column.
- Both columns are rendered by a single component (`OrgHeadColumn`,
  `scope: 'bu' | 'department'`) in `src/components/admin/BuHeadColumn.tsx`.
  `BuHeadColumn` remains as a back-compat wrapper around `<OrgHeadColumn scope="bu" />`.
- Change-head picker = searchable combobox (Popover + Command); accepts **any
  active employee company-wide**, shows `Department · BU` context.

## Annual Review integration
`seedInstancesForCycle` / `seedInstancesByRules` read `business_units.head_user_id`
for `bu_head_id`, `departments.head_user_id` for `dept_head_id`, and call
`getHrHeadUserId(companyId)` (BU-named-"HR" lookup) for `hr_id`. Legacy 3-hop
ancestor walk and `args.hrUserId` survive as fallbacks. Per-instance
`annual_review_assignment_overrides` still wins.
