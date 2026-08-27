# Copy KRAs on the employee scorecard (admin only)

## What you get
A **Copy KRAs** button in the *KPI Details* toolbar of the employee scorecard, sitting to the left of **Add KRA** (the empty slot in your screenshot). It opens the same Copy KRAs dialog already used in the Admin KPI Dashboard, pre-filled with the employee and period you are currently viewing as the copy *source* — so you only pick the KRAs and the target employees.

Visible to **admins only** (same `effectiveRole === 'admin'` gate as the existing Zero-Score and Rollover KRAs buttons). Non-admins see no change.

## Assumptions
- "Copy care teacher" = the existing **Copy KRAs** tool (`CopyKrasDialog`).
- Current scorecard employee/period is the sensible default source; both remain editable inside the dialog.

## Changes

1. `src/components/admin/CopyKrasDialog.tsx`
   - Add optional props `defaultSourceEmployeeId`, `defaultSourcePeriod`, `defaultSourceYear` used as the initial state values. No behaviour change when omitted (Admin KPI Dashboard keeps working as-is).

2. `src/components/review/UnifiedScorecard.tsx`
   - New local state `copyKrasOpen`.
   - Admin-only outline button `Copy KRAs` (Copy icon) rendered before the existing Zero-Score button in the toolbar.
   - Mount `CopyKrasDialog` lazily (`{isAdmin && copyKrasOpen && ...}`) in the same dialog block as the other admin dialogs, passing the current employee id, `selectedPeriod`, `selectedYear`.

No backend, RPC, RLS, or schema changes — the dialog's existing writes and admin RLS already govern the operation.

## Risk & impact
- Data: none new; copy path unchanged (existing duplicate-KPI constraint and Org KPI inheritance rules still apply).
- Workflow/permissions: additive, admin-gated; server RLS remains authority.
- UI: one extra button in an existing flex toolbar that already wraps; verified at 1280px and 375px.
- Regression: dialog props are optional, so the Admin KPI Dashboard usage is untouched.
- Rollback: remove the button + props.

## Tests & docs
- Unit test asserting the dialog seeds its source state from the new default props and falls back to today's month/year when absent.
- DOCUMENTATION.md: note the scorecard entry point; POLICY.md: record the admin-only gate for scorecard Copy KRAs.
