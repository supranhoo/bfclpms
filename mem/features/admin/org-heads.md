---
name: Org Heads (BU & HR head mapping)
description: Admin-managed BU head and HR head used by Annual Review reviewer chain; auto-resolved from top of hierarchy with manual override
type: feature
---

## Storage
- `business_units.head_user_id` (+ `head_source` 'auto'|'manual', `head_updated_at`, `head_updated_by`)
- `org_head_config(company_id PK)` — `hr_business_unit_id`, `hr_head_user_id`, `hr_head_source`, ...

## Resolver SSOT
- `public.resolve_bu_head(p_bu_id)` — top of reporting hierarchy among ACTIVE candidates.
  Candidate scope = employees whose department is in the BU, PLUS division-level
  employees (department name = division name, within the same division — covers
  cross-BU division heads like Sajid in dept "DRI" leading both 1050 TPD and 3X100 TPD).
  Roots = candidate whose `reporting_manager_id` is NULL or outside the candidate set.
  Tie-break: **level seniority** (M0=0 … M7=7, W1=8 … W5=12, NULL/unknown=99) ASC,
  then `doj` ASC NULLS LAST, then `id`.
  (`departments` has no `division_id`; division is reached via `business_units.division_id`.
  `levels.rank` does not exist — an earlier version referencing it raised
  "WITHIN GROUP is required for ordered-set aggregate rank".)
- `public.resolve_hr_head(company_id)` — delegates to `resolve_bu_head(hr_business_unit_id)`.

## RPCs (admin / hr_pms only, audit-logged as `org_heads.*`)
- `set_bu_head(bu_id, user_id, reason)` — manual override, reason >=3 chars.
- `recalculate_bu_head(bu_id)` — re-derives via resolver, flips source back to 'auto'.
- `set_hr_department(company_id, bu_id)` — picks the HR BU.
- `set_hr_head(company_id, user_id, reason)` / `recalculate_hr_head(company_id)`.

## UI
- BU Head lives **inline on the Business Units tab** as a "Head" column with
  Auto/Manual badge + recalculate / change buttons per row.
- HR Head lives on the **HR Finalization** tab (formerly "Org Heads").
- Change-head picker accepts **any active employee company-wide** (cross-BU
  allowed for matrix structures); the dropdown shows `Department · BU` context.

## Annual Review integration
`seedInstancesForCycle` / `seedInstancesByRules` now read `business_units.head_user_id`
for `bu_head_id` and `org_head_config.hr_head_user_id` for `hr_id`. Legacy 3-hop ancestor
walk and `args.hrUserId` survive as fallbacks when the new fields are empty. Per-instance
`annual_review_assignment_overrides` still wins.