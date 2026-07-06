## Goal
Move the `annual_review_enabled` audience targeting into **Annual Review → Settings** as a new **Pilot Access** card, with structured filters (Grade, Level, Business Unit, Department, Has KRA) to preview matching employees and bulk-add them to the pilot allowlist.

## Assumptions
- The master ON/OFF switch and `admin_feature_flags` row stay as the source of truth (`target_user_ids`, `target_roles`). No schema change.
- "Has KRA" = the employee has at least one row in `public.kpis` (active). Confirm during build if a stricter filter (e.g. active period only) is needed.
- Filters combine with **AND**. Preview shows the resolved set; admin clicks **Add all N to pilot** to append to `target_user_ids` (dedup, no removals).
- Feature Flags tab keeps working for other flags. For `annual_review_enabled`, the tab will show a read-only summary + a "Manage in Annual Review Settings" link so there's one editor.

## Risk & Impact Report
- **Data**: No schema change. Writes go to existing `admin_feature_flags.target_user_ids` (uuid[]) via the same RLS-protected update path used today.
- **Workflow**: Only who sees the Annual Review module during pilot; gate logic (`AnnualReviewGate` / `is_feature_flag_enabled_for_me`) unchanged.
- **UI/UX**: New card inside existing Settings tab, matches shadcn patterns already used there (Card, Select, MultiSelect via ToggleGroup / Command).
- **Regression**: Feature Flags tab card for `annual_review_enabled` becomes read-only for target users — role toggling still available there, or move both. Plan keeps role toggling in Feature Flags to minimize churn; only user targeting moves.
- **Scalability**: Preview query is a single `profiles` select with indexed filters + `id IN (SELECT employee_id FROM kpis)` sub-select, capped at 500 rows with pagination hint. Bulk-add dedupes client-side then writes one row.

## Plan

1. **New component** `src/components/annual-review/PilotAccessCard.tsx`
   - Reads `admin_feature_flags` row for `annual_review_enabled`.
   - Filter row: Grade (from `pms_grades`), Level (from `levels`), Business Unit (from `business_units`), Department (from `departments`, cascades on BU), Has KRA (Yes/No/Any).
   - "Preview matches" button → runs `profiles` query (active only), joins `pms_grade_id`, `level_id`, `department_id`, `departments.business_unit_id`. Applies Has KRA via `EXISTS (kpis where employee_id=profiles.id)`.
   - Results table (name, code, grade, level, dept, BU, KRA count) with select-all + individual checkboxes.
   - Actions: **Add selected to pilot**, **Add all matches to pilot**, **Remove from pilot** (chips of currently targeted users at top).
   - Uses same update pattern as `FeatureFlagsTab` (`update admin_feature_flags set target_user_ids where key='annual_review_enabled'`).

2. **Wire into Settings tab** `src/pages/annual-review/AnnualReviewAdmin.tsx` `SettingsTab()` — add `<PilotAccessCard />` above existing Display Settings.

3. **Feature Flags tab** `src/components/admin/FeatureFlagsTab.tsx`
   - For `annual_review_enabled` only: hide the user search / chip editor and render a small notice "Manage pilot users in Annual Review → Settings" with a link. Role toggles + master switch stay editable.

4. **Invalidations**: after write, invalidate `['admin_feature_flags']` and `['annual_review_flag']` (gate hook) so the module appears/disappears without reload.

### UI Changes
- Location: Annual Review Admin → Settings tab, new **Pilot Access** card at top.
- Visual: standard Card with header "Pilot Access — Annual Review", filter grid (5 controls), Preview button, results table with row-select, sticky action bar with counts and Add buttons, current-audience chip strip.
- Interaction: Filters are optional (empty = no constraint). Preview required before Add. Confirm dialog on "Add all matches" when count > 25.
- Responsive: filters wrap 2/row on mobile; table becomes horizontal-scroll.

### Technical Details
- Data hooks colocated in `src/components/annual-review/pilotAccess.hooks.ts`: `usePilotAccessFlag`, `usePilotPreview(filters)`, `useUpdatePilotAudience`.
- Filter shape: `{ grade_ids: string[]; level_ids: string[]; business_unit_ids: string[]; department_ids: string[]; has_kra: 'yes'|'no'|'any' }`.
- Query pattern (client-side supabase-js), all `.in()` optional:
  - Base: `profiles.select('id, full_name, employee_code, pms_grade:pms_grades(name), level:levels(name), department:departments!profiles_department_fk(name, business_unit_id, business_unit:business_units(name))').eq('is_active', true).limit(500)`
  - `has_kra=yes`: filter client-side against a `kpis` presence set fetched as `select employee_id from kpis where employee_id in (candidate_ids)`.
- Writes: `update admin_feature_flags set target_user_ids = <dedup union/diff> where key='annual_review_enabled'`.
- No RLS change. No migration.

### Tests
- Unit test for filter → query-args builder (empty filters produce no `.in()` calls; mixed filters chain correctly).
- Unit test for `mergeAudience(current, add)` and `removeFromAudience(current, remove)` (dedup, order-stable).
- Mock data covers: employee with grade+level+BU+dept+KRAs, employee missing grade, employee with no KRAs.

### Docs & Policy
- Update `src/modules/annual-review/DOCUMENTATION.md` — new "Pilot Access UI" section.
- Update `src/modules/annual-review/POLICY.md` §AR-PILOT-ALLOWLIST — clarify UI location and filter semantics.
- Append entry to Version History.

## Rollback
- Delete `PilotAccessCard.tsx`, revert Settings-tab and FeatureFlagsTab edits. No DB changes to undo.

## Not Applicable
- Migrations, edge functions, cron.
