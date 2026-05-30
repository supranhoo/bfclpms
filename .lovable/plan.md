# Add Group Date of Joining (GDOJ) — User Management

## Scope (strictly what was asked)
1. Add User page (UserManagement.tsx) — new GDOJ date field.
2. Import Employees template/parser — accept `gdoj` / `group_doj` / `groupDoj` column and persist it.
3. Export Employees — include GDOJ column.

Out of scope: changing profile UI elsewhere, reports, hierarchy logic.

## Assumptions
- GDOJ is a plain calendar date (no time component).
- Optional / nullable — existing employees won't have it.
- "Group Date of Joining" differs from `created_at` (account creation) and from any company-level DOJ; it represents the date the employee joined the group/parent organisation.
- Stored on `public.profiles` as a single new column.

## Risk & Impact Report
- **Data Impact:** Additive column `profiles.group_doj date NULL`. No backfill, no destructive change. Existing rows unaffected.
- **Workflow Impact:** None — no business logic reads GDOJ today.
- **UI/UX Impact:** One new optional date input in the Add User dialog; one new column in import template + export sheet.
- **Regression Risk:** Low. Field is nullable and untouched by existing flows. ImportData parser only adds a new optional key.
- **Scalability:** Single date column, no index needed (not queried/filtered yet).
- **Backup:** Coverage is automatic via `get_backup_table_order()` (profiles already included) — no allowlist edit needed.
- **Rollback:** `ALTER TABLE public.profiles DROP COLUMN group_doj;`
- **Mitigation:** Zod schema validates date format; unit tests cover parser + add-user payload.

## Implementation Steps

### 1. Migration (additive)
```sql
ALTER TABLE public.profiles ADD COLUMN group_doj date;
COMMENT ON COLUMN public.profiles.group_doj IS 'Group Date of Joining — date employee joined the parent group.';
```
No RLS / GRANT changes (profiles already configured).

### 2. Add User form — `src/pages/admin/UserManagement.tsx`
- Extend the add-user form state with `groupDoj: string | null`.
- Add a shadcn Popover + Calendar date picker (pointer-events-auto) labelled "Group Date of Joining (GDOJ)".
- Include `group_doj` in the insert payload (ISO `yyyy-MM-dd` or null).
- Same field surfaced in Edit User dialog for parity (small, non-scope-creep change since it's the same form).

### 3. Import template — `src/pages/admin/ImportData.tsx`
- Add `gdoj` (aliases: `group_doj`, `groupDoj`, `group date of joining`) to the row mapper near existing `designation` / `pmsGrade` keys.
- Extend `EmployeeImportRowSchema` in `src/lib/importValidation.ts` with `groupDoj: z.string().optional()` parsed/normalised to `yyyy-MM-dd` (accept Excel serial, `dd/mm/yyyy`, ISO).
- Persist `group_doj` in both insert and update branches (lines ~1317 and ~1382).
- Add column to the downloadable template + the import-preview table.

### 4. Export employees
- Add `'Group DOJ': profile.group_doj || ''` to the export row (around line 1742) and to the template export (line ~2099).

### 5. Tests
- `src/lib/importValidation.test.ts` — new cases: valid ISO date, dd/mm/yyyy, blank, invalid string rejected.
- New `src/test/admin/userManagementAddUserGdoj.test.ts` — payload includes `group_doj` when set, omits when blank.

### 6. Docs (mandatory)
- `DOCUMENTATION.md` — add GDOJ to profiles schema reference + User Management / Import sections + Version History entry.
- `POLICY.md` — note GDOJ is optional master data, no workflow impact, source-of-truth captured at user provisioning.

## Technical Notes
- Date storage: `date` (not `timestamptz`) — avoids timezone drift.
- Display format in UI: `dd MMM yyyy` via `date-fns format`.
- Excel serial conversion in import handled via existing date helper if present; otherwise inline (`new Date(Date.UTC(1899,11,30)) + serial*86400000`).
- Zero-hardcoding: column is plain data, no enum or master table needed.

## Verification Checklist
- [ ] Migration applied; `\d profiles` shows `group_doj date`.
- [ ] Add User saves a row with GDOJ; reopening Edit shows the value.
- [ ] Import xlsx with `gdoj` column populates the field for new + existing rows.
- [ ] Export xlsx contains the `Group DOJ` column with values.
- [ ] Unit tests pass.
- [ ] DOCUMENTATION.md + POLICY.md updated in same change.
