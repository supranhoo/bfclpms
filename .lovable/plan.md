## Assumptions

- Setting stored via existing `system_settings` mechanism with key `employee_master_field_requirements`, value = JSON object (booleans per field). Default: `{ full_name: true, employee_code: true, ...all others: false }`.
- "General" section of System Settings is currently a single scrolling page (not nested tabs). I'll add a new **card section** titled "Employee Master Fields" inside the General view (consistent with existing styling). If you'd prefer a true sub-tab, say the word and I'll switch the layout.
- The Add New User dialog lives in `src/pages/admin/UserManagement.tsx` (lines ~1644+). Validation is currently ad-hoc (only Full Name has a `*`). I'll replace the `*` with the red lowercase `l` indicator on all configured-mandatory fields and add config-driven validation.
- Edit User dialog: out of scope for the red-`l` indicator (spec mentions only Add New User). Validation in Edit dialog stays unchanged.
- Backend hard floor: `full_name` and `employee_code` remain non-nullable in DB / required by `create-employee` edge function — admin cannot disable these in the UI (toggle shown but disabled with note "Required by system.").
- Server-side enforcement: the `create-employee` edge function will read `employee_master_field_requirements` and reject creates that violate it (so admins can't bypass via direct API).
- The "Is this a dummy/system employee?" toggle from the prior in-progress feature is included in the configurable list — when that field doesn't exist yet in the dialog (build still broken from previous step), it's silently skipped. Same for any field not yet rendered.

## Risk & Impact Report

- **Data Impact**: 1 new row in `public.system_settings` (`employee_master_field_requirements`). No schema changes. Additive.
- **Workflow Impact**: None for existing users. Add User flow gains stricter validation only for fields admin explicitly marks mandatory.
- **UI/UX Impact**:
  - New "Employee Master Fields" card in System Settings → General (table of 18 rows, each with a Yes/No switch).
  - Add New User dialog: existing red `*` on Full Name is replaced with a small red lowercase `l` glyph; same glyph appears on every other configured-mandatory label. Layout unchanged.
- **Regression Risk**: Low. Default config keeps today's behaviour byte-identical (only Full Name & Employee Code required). All other validation is opt-in.
- **Scalability**: Constant-size config (18 booleans). Single `useSystemSetting` fetch, cached. No new queries on save.
- **Rollback**: Delete the settings row; dialog falls back to defaults (`full_name`, `employee_code` mandatory).
- **Backup**: `system_settings` is already covered by the automatic backup allowlist — no change.

## UI — Employee Master Fields card (System Settings → General)

Placement: bottom of the General page, after the existing cards.

```text
┌─ Employee Master Fields ─────────────────────────────────────────┐
│ Configure which fields are required when creating a new user.   │
│                                                                  │
│ Field                              Mandatory                     │
│ ──────────────────────────────────  ───────────                  │
│ Full Name                          [ON]  Required by system.     │  ← disabled
│ Employee Code                      [ON]  Required by system.     │  ← disabled
│ Email                              [ ● ]                         │
│ Group Date of Joining (GDOJ)       [ ● ]                         │
│ Date of Joining (DOJ)              [ ● ]                         │
│ Confirmation Date                  [ ● ]                         │
│ Company                            [ ● ]                         │
│ Division                           [ ● ]                         │
│ Department                         [ ● ]                         │
│ Designation                        [ ● ]                         │
│ PMS Grade                          [ ● ]                         │
│ Employee Category                  [ ● ]                         │
│ Employment Status                  [ ● ]                         │
│ Location                           [ ● ]                         │
│ Reporting Manager                  [ ● ]                         │
│ Role                               [ ● ]                         │
│ Portal Access                      [ ● ]                         │
│ Dummy/System Employee              [ ● ]                         │
│                                                                  │
│ Note: Fields marked mandatory show a small red 'l' indicator    │
│ next to their label on the Add New User page.                   │
└──────────────────────────────────────────────────────────────────┘
```

Each switch debounces a single `useUpdateSystemSetting` write of the full JSON object (read-modify-write).

## UI — Add New User dialog

Before (today):
```text
Full Name *
[__________________]
```

After:
```text
Full Namel              Locationl              Departmentl
[_______________]       [▼ Select location]    [▼ Select dept]
```

- The `l` is a `<span class="text-destructive ml-0.5 lowercase font-medium">l</span>` placed immediately after the label text. No asterisk. Same glyph used everywhere — never capital `I`.
- On Save:
  - Iterate the config; for each `mandatory === true` field, check the corresponding form state is non-empty.
  - First failure → toast `"<Field Name> is mandatory."` and abort the create.
  - Email format check runs whenever email is non-empty (unchanged), and additionally is required when `email: true`.

## Plan

### 1. Schema / settings seed (single migration)

```sql
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES (
  'employee_master_field_requirements',
  '{"full_name":true,"email":false,"employee_code":true,"group_doj":false,"doj":false,"confirmation_date":false,"company_id":false,"division_id":false,"department_id":false,"designation":false,"pms_grade":false,"employee_category":false,"employment_status":false,"location_id":false,"reporting_manager_id":false,"role":false,"portal_access":false,"is_dummy_employee":false}'::jsonb,
  'Per-field mandatory flag for the Add New User page'
)
ON CONFLICT (setting_key) DO NOTHING;
```

### 2. Pure module — `src/lib/employeeMasterFields.ts`

- `EMPLOYEE_MASTER_FIELDS: { key, label, alwaysRequired }[]` — single source of truth (18 entries; `full_name` and `employee_code` have `alwaysRequired: true`).
- `DEFAULT_REQUIREMENTS` — derived from the list.
- `parseRequirements(raw)` — merges saved JSON over defaults; forces `alwaysRequired` keys to `true`.
- `validateRequiredFields(values, reqs)` → `{ ok: true } | { ok: false, fieldKey, label, message }`.
- Unit tests in `src/lib/employeeMasterFields.test.ts`.

### 3. Hook — `src/hooks/useEmployeeMasterFieldRequirements.ts`

Wraps `useSystemSetting('employee_master_field_requirements')` → `{ requirements, isLoading }` using `parseRequirements`.

### 4. Reusable mandatory glyph — `src/components/ui/RequiredMark.tsx`

```tsx
export const RequiredMark = () => (
  <span aria-label="required" className="text-destructive font-medium ml-0.5 lowercase select-none">l</span>
);
```

### 5. Admin UI card — `src/components/admin/EmployeeMasterFieldsCard.tsx`

- Table of 18 rows. Each row: label + `<Switch>`.
- `alwaysRequired` rows: switch checked, disabled, helper text "Required by system."
- Debounced save (300 ms) → `useUpdateSystemSetting` with full merged object.
- Mounted at the bottom of the General section in `SystemSettings.tsx`.

### 6. Add New User dialog (`src/pages/admin/UserManagement.tsx`)

- Read `useEmployeeMasterFieldRequirements()`.
- Replace existing `<span className="text-destructive">*</span>` on Full Name with `<RequiredMark />`.
- Add `<RequiredMark />` after each label whose key is mandatory in the config.
- Pre-save: run `validateRequiredFields`; on failure show toast and return.
- Keep all existing logic (combobox, role assignment, dummy flag) intact — surgical changes only.

### 7. Server-side guard — `supabase/functions/create-employee/index.ts`

- After auth check, fetch the setting via service-role client.
- Validate incoming payload against the requirements; respond `400 { error: "<Label> is mandatory" }` on violation.
- `full_name` + `employee_code` checks remain regardless of config.

### 8. Tests

- `employeeMasterFields.test.ts` — defaults, merge, alwaysRequired override, validate ok/fail cases.
- Smoke test: card renders 18 rows, `full_name`/`employee_code` switches disabled.

### 9. Docs

- `DOCUMENTATION.md` — new v2.68.0 entry describing setting, card, glyph, validation, and server guard.
- `POLICY.md` — new §: "Employee Master Field Requirements" (default-OFF except 2 system-required fields; visual indicator = lowercase red `l`, never `*` or `I`).

## Out of Scope

- Edit User dialog visual indicators (spec only covers Add New User).
- Bulk import validation (CSV importer keeps its own existing rules).
- Per-role or per-company override of requirements.

## Open Questions

1. **Sub-tab vs in-page card** in System Settings → General? Default: in-page card (lower-risk, matches today's layout). Switch to a real sub-tab only if you confirm.
2. **Edit User dialog**: keep unchanged (default), or mirror the same red-`l` indicators there too?
3. **Server-side rejection vs warning**: hard `400` rejection (default) or soft warning that still allows admin override?
