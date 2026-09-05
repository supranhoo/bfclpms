# Employee header: contact details + Edit (admin)

## What exists already (verified)

- `src/components/review/EmployeeContactCard.tsx` — a ready contact popover (avatar, name, code, designation, department, email, mobile, copy buttons, action button). Already used by the team list grid.
- `src/pages/admin/UserManagement.tsx` — the full employee edit dialog (`openEditDialog`) with every master field and custom fields. It already supports deep links: `/admin/users?manage=<id>&tab=…` opens the access sheet.
- The header block in question is in `src/components/review/UnifiedScorecard.tsx` (back arrow + avatar + name/code + designation | department). It is plain text today, with no click behaviour.

Nothing new needs to be built for either the contact display or the edit form — both already exist and will be reused.

## Plan

1. Make the header name block clickable and wrap it in the existing contact popover, so anyone opening a team member's scorecard can see email and mobile with copy buttons (same card the team list uses). Its main action button stays context-appropriate.
2. Add an "Edit in Employee Master" action inside that popover, shown only to admins. It navigates to the existing employee admin page with the person preselected — no duplicate edit form.
3. Extend the existing deep-link handling on the employee admin page with `?edit=<id>`, which opens the existing edit dialog for that person (mirrors the `?manage=` pattern already there).
4. Pass the mobile number into the scorecard header. The team grid already loads it; the scorecard's employee shape gains one optional field so the popover can show it, falling back to "Not provided".

## UI changes

- Team member header in the scorecard: name/designation area becomes a clickable target (hover affordance + focusable button, 44px touch height on tablet/mobile). Clicking opens the existing contact card popover.
- Popover gains one extra footer action, "Edit in Employee Master", visible to admins only.
- No change to the self-review header, filters, tiles or KPI list.

## Risk and impact

- Data: none. No schema, RLS, RPC or scoring change; contact fields are already readable by these reviewers.
- Permissions: the edit route stays admin-only and enforced by the existing route guard; the popover action is only a shortcut.
- Regression: low — additive wrapper around existing header markup plus one new URL parameter branch. Rollback = revert the three touched files.

## Technical notes

Files touched: `src/components/review/UnifiedScorecard.tsx` (header wrap, optional `mobile_number` on the employee prop), `src/components/review/EmployeeContactCard.tsx` (optional admin edit action prop), `src/components/review/EmployeeSelectorGrid.tsx` (pass mobile through), `src/pages/admin/UserManagement.tsx` (`?edit=` deep link).

Tests: one presentation test that the header popover renders email/mobile and shows the edit action only for admin, plus a deep-link unit test that `?edit=<id>` resolves the target profile. Then ADR entry, POLICY and DOCUMENTATION version-history sync.
