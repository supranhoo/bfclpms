
# Add/Delete KRA on Dashboard + Admin Role Configuration

## Goal
Let approved roles (configured by Admin) add a new KRA or delete an existing KRA directly from the Dashboard, instead of going to `Admin → All KPIs`. No new business logic — wire existing tested components and hooks.

## Reuse Inventory (no duplicates)
- Add dialog: `src/components/admin/AdminKpiCreateDialog.tsx` (already supports `defaultEmployeeId`, `defaultReviewPeriod`, `defaultReviewYear`).
- Edit dialog (already on KPI rows): `src/components/admin/AdminKpiEditDialog.tsx`.
- Create mutation: `useCreateKpi` (`src/hooks/useKpis.ts`).
- Delete mutation: `useAdminDeleteKpi` (`src/hooks/useKpis.ts`).
- Confirm-destructive dialog (per memory `destructive-action-governance`): `ConfirmDestructiveDialog`.
- Role allowlist UI pattern: existing `_roles` setting renderer in `WorkflowSettingsTab.tsx` (reused as-is).
- Settings hook: `useWorkflowSettings.ts` (categories, parsing, mutation).
- Roles SSOT: `src/lib/roles.ts` (`ALL_APP_ROLES`).

No new dialogs, no new mutations, no schema changes to `kpis`.

## Risk & Impact Report
- **Data Impact**: None to schema. Inserts/deletes already covered by RLS on `kpis` (admin path). The new "Delete KRA" button only appears in the user's own dashboard scorecard — server still enforces RLS, so client gating is UX, not security.
- **Workflow Impact**: Self-service KRA addition is a policy shift. We mitigate by (a) hiding controls unless the caller's role is in the new `dashboard_kra_management_roles` allowlist; (b) defaulting the allowlist to `["admin"]` (current behavior preserved); (c) Add only auto-fills `defaultEmployeeId = self`, `defaultReviewPeriod`/`defaultReviewYear` = current period — admin can still override inside dialog.
- **UI/UX Consistency**: Buttons placed in the existing scorecard header action zone (same area used by `KpiHeaderSection` admin actions). Mobile-safe (icon-only at `<sm`).
- **Regression Risk**: Low — UnifiedScorecard / Dashboard layout untouched except for two buttons. Admin All KPIs page unchanged. Existing `KpiHeaderSection` admin "Edit" button stays for the per-row case; we add a per-row "Delete" only when allowlist matches.
- **Mitigation**: Unit tests on the allowlist gate util + a smoke render test on the new buttons hidden/shown based on role.

## Plan

### 1. New workflow setting (DB-driven, zero hardcoding)
Add one row to `workflow_settings`:
- `category = 'validation'` (existing category; avoids enum change). _Alternative considered:_ a new `'dashboard'` category — rejected because `SettingCategory` is an enum string; adding a new value cascades changes through `WorkflowSettingsTab` config. Stay simple.
- `setting_key = 'dashboard_kra_management_roles'`
- `setting_value = '["admin"]'`
- `label = 'Roles allowed to Add/Delete KRA from Dashboard'`
- `description = 'Members of these roles see Add KRA / Delete KRA buttons on their Dashboard. Admin always allowed.'`

This is inserted via the migration tool. The existing `_roles` UI branch in `WorkflowSettingsTab.tsx` already renders any `setting_key` ending in `_roles` as a checkbox grid using `ALL_APP_ROLES` — **no new admin UI code required**, the row will appear automatically under "Validation Rules".

If a dedicated heading is preferred, we will add a new category `'dashboard'` to `SettingCategory`, `CATEGORY_CONFIG`, `CATEGORY_ORDER`, and treat `_roles` as allowed there too (small one-file diff). Decision left to user; default = use `'validation'`.

### 2. Hook: `useDashboardKraPermissions`
New file `src/hooks/useDashboardKraPermissions.ts`:
- Reads `workflow_settings` via existing `useWorkflowSettings()` (no new query).
- Parses `dashboard_kra_management_roles` JSON into `string[]`, defaulting to `['admin']`.
- Returns `{ canAdd: boolean, canDelete: boolean, allowedRoles: string[] }` based on `useAuth().effectiveRole`.
- Admin always returns true regardless of list (safety net).
- Co-located unit test (vitest) covering: admin always-on, role in list, role not in list, malformed JSON fallback, empty list fallback.

### 3. Dashboard "Add KRA" button
In `src/pages/Dashboard.tsx` (self view block, ~line 404):
- Gate with `useDashboardKraPermissions().canAdd`.
- Render a small toolbar above `<UnifiedScorecard viewLevel="self" …>` with a primary "Add KRA" button (lucide `Plus` icon).
- On click, open `AdminKpiCreateDialog` with:
  - `defaultEmployeeId = profile.id`
  - `defaultReviewPeriod = periodSelection.selectedMonth`
  - `defaultReviewYear = periodSelection.selectedYear`
- For reviewer modes (`team`, `hr_pms`, `audit`, `management`) when a `selectedEmployee` is open, the same button appears and pre-fills `selectedEmployee.id` so an HR/Manager can add a KRA for the displayed employee (still gated by allowlist).
- React Query already invalidates the `kpis` keys on create — no extra wiring.

### 4. Per-row "Delete KRA" in scorecard
In `src/components/review/KpiHeaderSection.tsx`:
- Inside the existing `isAdmin && (<div …actions>)` block, change the gate from `isAdmin` to `canDelete || isAdmin` using the new hook.
- Add a `Trash2` button next to "Step Back".
- On click, open `ConfirmDestructiveDialog` (memory `destructive-action-governance`) with KRA name + KPI name + employee name in the message.
- On confirm, call `useAdminDeleteKpi().mutate(kpi.id)` — same path Admin All KPIs uses, so RLS, audit logs, and cascade behavior are identical.
- Edit and Step Back stay admin-only (unchanged).

### 5. Memory + docs
- Update `mem/index.md` adding a new entry pointing to `mem://features/admin/dashboard-kra-management` with a one-liner: "Allowlist-gated Add/Delete KRA from Dashboard reusing AdminKpiCreateDialog + useAdminDeleteKpi".
- Create `mem/features/admin/dashboard-kra-management.md` capturing: setting key, default value, gating rule (admin always-on), reuse of existing dialogs/hooks, location of buttons.
- Append a Version History entry to `DOCUMENTATION.md` and `POLICY.md` (per workspace SSOT directive) describing the new self-service rule.
- Add an ADR (`docs/adr/ADR-062.md`) noting the policy decision and that no schema changes were needed.

### 6. Tests
- `src/hooks/useDashboardKraPermissions.test.ts` — gate logic (above).
- Extend `src/pages/admin/__tests__/AllKpis*.test.tsx` only if exists — skip if not present.
- Add a render test under `src/components/review/__tests__/KpiHeaderSection.delete.test.tsx` asserting the Delete button only renders when `canDelete` is true and triggers `ConfirmDestructiveDialog`.

## Out of scope (explicit)
- Bulk delete from dashboard.
- Editing KRA from the per-row dashboard action (Edit stays admin-only via existing button).
- Any changes to RLS, `kpis` table, or audit/log tables.
- Replacing existing Admin → All KPIs flows.

## Open question (won't block plan, will ask before build)
Should this also apply to **manager-on-team-member** view (Add KRA for a direct report from Dashboard), or strictly self + admin? Default in plan above: yes for any allowed role when an employee is selected; we will confirm before wiring.
