# Dummy/System Employee Visibility

## Assumptions

- "Profiles" table is the canonical employee master (consistent with rest of project).
- Flag name: **`is_dummy_employee boolean NOT NULL DEFAULT false`** on `public.profiles`.
- Two new `system_settings` keys (JSON string values, matching the existing `useSystemSettings` pattern):
  - `show_dummy_in_excel` → `"yes" | "no"` (default `"no"`)
  - `show_dummy_in_frontend` → `"yes" | "no"` (default `"no"`)
- Defaults = **No** (hide dummies) — matches the spec and is safe (existing dummies like auditor001 disappear from business views immediately once marked).
- Dummies remain fully functional for login, RLS, scoring, audit logs, notifications, backups. Only **visibility** in business selectors/reports changes.
- Admin User Management always shows everyone (with a "Dummy/System" badge + filter).

## Risk & Impact Report

- **Data Impact**: Additive. One nullable-safe boolean column on `profiles` (default false). Two new rows in `system_settings`. No backfill of `true` — admins mark dummies manually. Historical data, audit logs, PMS scores untouched.
- **Workflow Impact**: None for real employees. Dummies stay logged-in, keep roles, keep RLS access. Only UI lists and Excel rows filter them out.
- **UI/UX Impact**: 
  - New Yes/No switch in Add/Edit User dialog.
  - New "Dummy/System Employee Visibility" card in System Settings → General.
  - New "Dummy/System" badge + status filter (All / Real / Dummy) in User Management table.
- **Regression Risk**: Medium-low. The risk is silently dropping rows from a report. Mitigation: central helper `applyDummyEmployeeFilter()` used everywhere, gated by the setting, with the setting **defaulting to "no"** — but only filtering rows where `is_dummy_employee === true` (so until admin marks anyone, behaviour is byte-identical to today).
- **Scalability**: O(n) client-side filter on already-fetched lists. No extra queries (the flag is added to existing `profiles` selects). Indexed `WHERE is_dummy_employee = true` partial index for future server-side filtering.
- **Rollback**: Drop column + 2 settings rows; remove helper call sites. Filter helper no-ops when column missing.
- **Backup**: `profiles` is already covered by the automatic `get_backup_table_order()` allowlist — no change needed (per Core memory).

## Placement Decisions

- **Flag column**: `public.profiles.is_dummy_employee` (not a separate table — single boolean, profile-scoped).
- **Settings UI**: System Settings → General tab (new card below existing cards).
- **Admin filter UI**: User Management toolbar — new "Employee Type" dropdown (All / Real / Dummy-System), with a badge on each row.
- **Filter helper**: `src/lib/dummyEmployeeFilter.ts` — pure, mirrors the pattern of `src/lib/reportEmployeeFilter.ts`.

## Plan

### 1. Schema (single migration)

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_dummy_employee boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_dummy_employee
  ON public.profiles (is_dummy_employee) WHERE is_dummy_employee = true;

INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES
  ('show_dummy_in_excel',    '"no"', 'Show dummy/system employees in Excel reports/exports'),
  ('show_dummy_in_frontend', '"no"', 'Show dummy/system employees in frontend business views/selectors')
ON CONFLICT (setting_key) DO NOTHING;
```

No RLS/GRANT changes (column inherits existing `profiles` policies; `system_settings` already covered).

### 2. Pure helper + hooks

**`src/lib/dummyEmployeeFilter.ts`**
```ts
export function applyDummyEmployeeFilter<T>(
  rows: T[],
  showDummies: boolean,
  getIsDummy: (row: T) => boolean | null | undefined,
): T[] {
  if (showDummies) return rows;
  return rows.filter(r => getIsDummy(r) !== true);
}
```

**`src/hooks/useDummyEmployeeVisibility.ts`** — reads the two settings via existing `useSystemSetting('show_dummy_in_excel' | 'show_dummy_in_frontend')`. Returns `{ showInExcel, showInFrontend, isLoading }`. Defaults to `false` while loading and when setting is missing.

### 3. Admin: Add/Edit User dialog

File: `src/components/admin/users/UserFormDialog.tsx` (or current equivalent — confirm during impl). Add:
- Switch: **"Is this a dummy/system employee?"** (default off)
- Helper text per spec
- Wire to `is_dummy_employee` in the upsert payload + `profiles` row.

### 4. Admin: User Management table

- Add **"Dummy/System"** badge (subtle muted variant) next to name when `is_dummy_employee === true`.
- Add toolbar filter: **Employee Type** — `All | Real Employees | Dummy/System` (client-side filter on the existing list).
- **Never** apply the global visibility setting here — admins always see everyone.

### 5. System Settings → General

File: `src/pages/admin/GeneralSettings.tsx` (or current equivalent). New card:
- Title: **"Dummy/System Employee Visibility"**
- Switch 1: "Show dummy/system employees in Excel reports?" → writes `show_dummy_in_excel`
- Switch 2: "Show dummy/system employees on frontend views?" → writes `show_dummy_in_frontend`
- Uses existing `useUpdateSystemSetting` mutation.

### 6. Apply frontend filter (`showInFrontend === false`)

Apply `applyDummyEmployeeFilter` in selectors/lists that surface real employees for business use. Targets (each only filters when the setting fetch is ready):
- `EmployeePickerCombobox` (review notes)
- Dashboard employee lists / reviewer grids (`useMyVisibleEmployeeIds` consumers — filter at the component layer, not the hook, so admin screens stay unaffected)
- Report filter dropdowns (`CompanyFilter` siblings — the employee picker)
- KPI assignment employee lists
- Increment input employee search (`IncrementInputs.tsx`)
- Incentive input employee search (`IncentiveDataEntry.tsx`)
- Management / audit employee views

Approach: each list component already selects `profiles` rows — add `is_dummy_employee` to the select, then pipe the array through the helper using `useDummyEmployeeVisibility().showInFrontend`. **Do not** filter inside shared hooks like `useMyVisibleEmployeeIds` (those are also used by admin screens).

### 7. Apply Excel filter (`showInExcel === false`)

In every Excel export path, filter the export rows just before `XLSX.writeFile`. Targets confirmed from codebase:
- `OrgKpiBulkExport` (and other admin exports)
- `MonthlyIncentiveTable` / `RetroactiveAdjustmentTable` exports
- `IncrementInputs` Run Details + summary exports
- `PerformanceReport`, `DepartmentReport`, `KRAIssuance`, `IssuesReport`, `QueryReport`, `CustomReport`, `MonthlyTrendTable`, `KPI Employee Matrix Report`
- Any other `downloadXlsx` / `XLSX.writeFile` call site

Each export resolves `is_dummy_employee` on its row (joining via employee_id where needed), then applies the helper.

### 8. Tests

- `src/lib/dummyEmployeeFilter.test.ts` — pure helper: setting on/off, mixed rows, missing flag, empty list.
- Component test for User Management filter toggle (real / dummy / all).

### 9. Docs

- `DOCUMENTATION.md` — new section "Dummy/System Employees" + version-history entry.
- `POLICY.md` — new rule describing flag semantics, default OFF, visibility-only impact, admin override in User Management.

## UI Changes Summary

- **Add/Edit User dialog**: new switch + helper text below the existing fields.
- **User Management table**: new badge column treatment + new "Employee Type" dropdown in the toolbar.
- **System Settings → General**: new card with two switches.
- **All business employee selectors / Excel exports**: silently drop dummy rows when the corresponding setting is "no". No layout change.

## Out of Scope

- Server-side RLS filtering of dummies (visibility is presentation-layer only, per spec part 7).
- Bulk-mark UI (admins flip the flag per-user as needed).
- Migration of any existing user — defaults stay `false`; admins mark `auditor001/002` themselves.

## Open Questions (confirm before build)

1. **Field name**: confirm `is_dummy_employee` (vs `is_system_employee`). I'll use `is_dummy_employee` unless you say otherwise.
2. **Reviewer/Auditor assignment dropdowns**: if a dummy `auditor001` is currently *assigned* as an auditor on real KPIs and we hide them from selectors, admins won't see them in the picker to reassign. OK to still show **already-assigned** dummies as static text (just hidden from the *picker*)? My default: yes — never break existing assignments, only filter the searchable list.
3. **Login / auth screens**: spec says "Do not block login". Confirmed — filter applies only to *lists of employees*, never to the logged-in user's own profile/menus.
