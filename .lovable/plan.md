## Goal

Introduce two new employee attributes — **Employee Category** and **Employment Status** — as fully admin-configurable master data (zero-hardcoding rule) and expose them on:

1. Admin → **Organization Structure** (new tabs as Masters)
2. Admin → **User Management** → Add New User + Edit User
3. Admin → **Import Data** → Employees template (CSV/Excel)
4. Admin → **Export Employees** (CSV/Excel download) — *added per request*

---

## Assumptions

- "Employee Category" = customer-defined buckets (e.g., Worker / Staff / Officer / Executive). Admin seeds values; we do NOT hardcode any.
- "Employment Status" = seeded with **Probation, Trainee, Confirmed, Superannuated, Retainer** but remains a master table — admin can add/edit/deactivate later.
- Both fields are **optional** at the profile level (nullable) so existing employees are unaffected.
- These fields are display + filter + import/export metadata for now. **No workflow / scoring / eligibility logic changes** in this scope.
- `employee_categories` is `company_id`-scoped (like `pms_grades`). `employment_statuses` is global. Open to revisit (Q1).

---

## Risk & Impact Report

| Area | Impact | Mitigation |
|---|---|---|
| Data | 2 new nullable cols on `profiles` + 2 new master tables. Additive only. | All nullable; rollback = drop columns + tables. |
| Workflow | None — no logic reads these yet. | Pure metadata in Phase 1. |
| RLS | New masters mirror `pms_grades` policies. | Reuse `has_role(_, 'admin')`. |
| Backup | Auto-covered via `public.get_backup_table_order()`. | No allowlist edits. |
| UI/UX | New tabs on Organization page; 2 new selects on Add/Edit User; 2 new columns on import template, preview, **and export**. | Follows existing tab/column patterns. |
| Export round-trip | Exported file must re-import cleanly with the same headers. | Use identical header casing in both export and import alias maps. |
| Regression | Low. | Profile cache invalidation already covers profile edits. |
| Rollback | Drop 2 cols, drop 2 tables. | Reversible. |

---

## UI Changes

### A. Organization Structure page (`/admin/organization`)

Two new tabs alongside existing (Divisions, BUs, Departments, Sub-Branches, Designations, PMS Grades, Levels, Locations):

```text
[Divisions] [BUs] [Departments] [Sub-Branches] [Designations]
[PMS Grades] [Levels] [Locations] [Employee Categories] [Employment Statuses]   ← NEW
```

Each new tab = copy of the PMS Grades tab pattern (Code, Name, Active, ✏️🗑️) with `+ Add` button, `MasterDataDialog` for create/edit, and `ConfirmDestructiveDialog` for delete. Seed for Employment Statuses: Probation, Trainee, Confirmed, Superannuated, Retainer.

### B. User Management → Add / Edit User dialog

Two new selects inserted right after PMS Grade:

```text
│ PMS Grade          [▼ Select]                 │
│ Employee Category  [▼ Select category ]  ← NEW│
│ Employment Status  [▼ Select status   ]  ← NEW│
│ Reporting Manager  [▼ Select]                 │
```

- Both optional; populated from active rows of master tables.
- User list table gains two new optional columns (collapsed on narrow viewports — current preview is 929px).

### C. Import Data → Employees template

Two new columns added to the downloadable template, just after `pmsGrade`:

```text
... | pmsGrade | employeeCategory | employmentStatus | managerEmployeeId | ...
```

- Accepted header aliases: `employee_category`, `category` / `employment_status`, `status`.
- Validation: non-empty cell must match an existing **active** master row by **name or code** (case-insensitive). Unknown values → row error listing available values.
- Preview table shows both new columns.

### D. Export Employees (NEW per this request)

Where: every place that exports an employee list as CSV/Excel — primarily the **"Export Employees"** action on the User Management page, plus the same template/export entry point on the Import Data page. Single shared export builder so we don't drift.

- Append two new columns at the end of the export, after the last existing organisation column:

```text
... pmsGrade | level | location | reportingManagerCode | reportingManagerName | employeeCategory | employmentStatus
```

- Values exported as the master row's **Name** (not UUID) so the file is human-readable and round-trips cleanly into the importer above.
- Empty cell when the profile has no value (no `-` or `N/A` strings — keeps the file re-importable).
- File name unchanged; sheet name unchanged.
- Header casing matches the importer aliases exactly (`employeeCategory`, `employmentStatus`) so a user can edit the exported file and re-upload without manual header fixes.

---

## Technical Plan

### Step 1 — DB migration
- `CREATE TABLE public.employee_categories (id, company_id, name, code, is_active, created_at, updated_at)` — unique on `(company_id, lower(name))`.
- `CREATE TABLE public.employment_statuses (id, name, code, is_active, sort_order, created_at, updated_at)` — unique on `lower(name)`. Seed 5 rows.
- `ALTER TABLE public.profiles ADD COLUMN employee_category_id uuid NULL REFERENCES public.employee_categories(id) ON DELETE SET NULL`.
- `ALTER TABLE public.profiles ADD COLUMN employment_status_id uuid NULL REFERENCES public.employment_statuses(id) ON DELETE SET NULL`.
- GRANTs (authenticated SELECT, admin write via RLS) + ENABLE RLS + policies mirroring `pms_grades`.
- Verify both tables appear via `public.get_backup_table_order()`.

### Step 2 — Hooks
- New: `useEmployeeCategories(companyId)` and `useEmploymentStatuses()`.
- Cache keys `['employee-categories', companyId]`, `['employment-statuses']`.

### Step 3 — Organization page
- Add 2 tab triggers + 2 `TabsContent` blocks (copy of PMS Grades).
- Extend `dialogType` union + the 3 switch statements with `'employee-category'` and `'employment-status'`.

### Step 4 — User Management
- Add `employeeCategoryId` / `employmentStatusId` to Create + Edit forms and payloads.
- Edge functions `admin-create-user` / `admin-update-user`: pass through both new optional UUIDs.

### Step 5 — Import Data (Employees)
- `parseEmployeeRow` reads `employeeCategory` / `employmentStatus` via alias array.
- Resolve name/code → id via in-memory lookup (one fetch of each master at import start).
- Update template generator, preview columns, and `EmployeeImportRowSchema`.

### Step 6 — Export Employees (NEW)
- Locate the existing export builder (User Management "Export" action; likely a shared util used by Import Data too). If two diverging exporters exist today, consolidate to one.
- Fetch joined `employee_categories(name)` and `employment_statuses(name)` alongside the existing profile select.
- Append two cells per row + two headers; preserve column order for all existing columns.
- Round-trip test: export → re-import yields zero diffs.

### Step 7 — Tests & Mock Data
- `employmentStatusResolver.test.ts`, `employeeCategoryResolver.test.ts` — name/code/case-insensitive matching + unknown value error.
- `employeeExport.test.ts` — new columns present, values are master names, blank when null, header names match importer aliases.
- Seed fixtures for both masters.

### Step 8 — Docs
- `DOCUMENTATION.md`: new "Employee Category & Employment Status" section under Org Masters, including export/import column reference.
- `POLICY.md`: metadata-only in Phase 1; future cycle-eligibility rules may reference them.
- New memory: `mem/features/admin/employee-category-and-status-masters` + index entry.

---

## Open Questions

1. **Employment Status scope** — global (default) or per-company?
2. **Profile page visibility** — show these two fields on the employee's own Profile → Organization card too?
3. **Import behavior for unknown values** — strict error (default) or auto-create the master row?

Confirm and I'll switch to build mode and implement Steps 1–8.
