---
name: Org Heads (BU & HR head mapping)
description: Admin-managed BU head and HR head used by Annual Review reviewer chain; auto-resolved from top of hierarchy with manual override
type: feature
---

## Storage
- `business_units.head_user_id` (+ `head_source` 'auto'|'manual', `head_updated_at`, `head_updated_by`)
- HR head = `business_units.head_user_id` of the BU named `HR` (case-insensitive)
  within the cycle's company (BU → division → company). No separate config row.
- `org_head_config` table still exists but is **deprecated and unused** by app code
  (left in place to avoid destructive migration; safe to drop later).

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
- HR head resolution lives in `src/services/orgHeads/hrHeadResolver.ts`
  (`getHrHeadUserId(companyId)`); the DB `resolve_hr_head` RPC is no longer called.

## RPCs (admin / hr_pms only, audit-logged as `org_heads.*`)
- `set_bu_head(bu_id, user_id, reason)` — manual override, reason >=3 chars.
- `recalculate_bu_head(bu_id)` — re-derives via resolver, flips source back to 'auto'.
- `set_hr_department`, `set_hr_head`, `recalculate_hr_head` — deprecated, no UI callers.

## UI
- BU Head and HR Head both live **inline on the Business Units tab** as a "Head"
  column (Auto/Manual badge + recalculate / change buttons per row). The HR head
  is simply the head of the BU named "HR" — no separate HR Finalization tab.
- Change-head picker = searchable combobox (Popover + Command); accepts **any
  active employee company-wide**, shows `Department · BU` context.

## Annual Review integration
`seedInstancesForCycle` / `seedInstancesByRules` read `business_units.head_user_id`
for `bu_head_id`, and call `getHrHeadUserId(companyId)` (BU-named-"HR" lookup) for
`hr_id`. Legacy 3-hop ancestor walk and `args.hrUserId` survive as fallbacks. Per-instance
`annual_review_assignment_overrides` still wins.