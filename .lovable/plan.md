# IAC Bulk — Matrix Download & Upload

## Problem (RCA)

1. **Download shows "only a few users"** — `exportAssignments()` returns one CSV row per *assignment* (686 rows total). Users with zero roles never appear, so admins see ~683 rows out of 2,532 active employees and assume data is missing.
2. **Format is unfriendly** — long-form `email, role_code, scope_type, scope_id, expires_at` requires admins to type role codes by hand and add multiple rows per person to grant multiple roles.
3. **Today all 686 assignments are `scope_type = global`** — there is no real per-scope data in use, so a flat per-user matrix is safe and lossless for the current footprint.

## Solution: Role-Matrix CSV (download = upload = round-trip)

One row per active employee. One column per active role. Cell value `Y` = granted (global scope), blank = not granted. Identity columns up front for human readability.

### CSV shape

```text
employee_code,email,full_name,is_active,pms_admin,pms_manager,pms_employee,pms_auditor,pms_management,pms_hr,pms_skip_level,safety_admin,safety_head,safety_bu_head,safety_manager,safety_supervisor,safety_officer,safety_auditor,safety_worker
E0123,jane@acme.com,Jane Doe,Y,,Y,,,,,,,,,,,,,
E0124,raj@acme.com,Raj K,Y,,,Y,,,,,,,,,,Y,,
```

- Header is generated dynamically from `iac_roles WHERE is_active = true` ordered by `module, code` so adding a role anywhere in the system flows through automatically (Zero-Hardcoding rule).
- Identity columns (`employee_code`, `email`, `full_name`, `is_active`) are read-only context; only the role columns are evaluated on upload.
- Comment lines (`#`) at the top document allowed values, that only `Y` (case-insensitive) grants, and that blank/`N`/`-` revoke.

### Download (every active employee, paginated)

- Pull every `profiles` row (`is_active = true`) using the existing `fetchAllPaged` helper — bypasses the 1000-row PostgREST cap that today silently truncates large exports.
- Pull every `iac_user_role_assignments` row in 1000-row pages.
- Build a `Map<user_id, Set<role_code>>` and emit one CSV row per profile, with `Y` in each role column the user holds at `scope_type = global`.
- Filename: `iac-role-matrix-YYYY-MM-DD.csv`.
- Visible counters in the UI: "Exported X employees × Y roles" so admins can verify completeness against the People tab count.

### Upload (full diff, no silent fail)

Three explicit phases, each surfaced in the UI:

1. **Parse & validate** — reuse `parseCsv` from `src/lib/iac/csv.ts`. New validator rejects unknown headers, missing `email` or `employee_code`, and any cell that is not blank/`Y`/`N`/`-`. Each issue is reported with line number.
2. **Diff preview** — for every row, resolve the user (by `email` first, then `employee_code`) and compare desired role set vs. current set. Output four buckets:
   - `toGrant` (cell `Y`, no current assignment)
   - `toRevoke` (blank/`N`, currently assigned at global scope)
   - `unchanged`
   - `errors` — unknown user, inactive user (warn, allow override checkbox), unknown role column, ambiguous match
   The Diff table is shown to the admin before any write.
3. **Apply** — only after explicit "Apply N changes" click:
   - Batch inserts in chunks of 500 into `iac_user_role_assignments`.
   - Batch deletes by `(user_id, role_id, scope_type='global')` in chunks of 500.
   - Each batch wrapped in try/catch; per-batch errors collected and shown in a results panel; partial success is allowed and clearly reported (no silent fail).
   - One audit log entry per batch via existing `iac_log` RPC: `assignment.bulk_matrix_apply` with `{ granted, revoked, errors, file_name }`.
   - React Query cache for `['iac','assignments']` and `['iac','audit']` invalidated on completion.

### Scope handling (current + future)

- Today: 100% of assignments are `global`. Matrix only writes `scope_type = 'global'`. Existing non-global assignments (none today) are preserved untouched — the diff explicitly ignores `scope_type != 'global'` rows so the matrix never deletes scoped grants it cannot represent.
- Future: when scoped roles are introduced, a separate "Scoped Assignments" CSV (the existing long-form export) remains available via a secondary "Advanced export" button, kept for backward compatibility.

## UI changes — Bulk tab

```text
[ Download role matrix ]   [ Download template ]   [ Advanced (long-form) ]
[ Upload CSV file ▼ ]      shows file name + row count
[ Validation summary ]     X parsed, Y errors  (expand to see per-line issues)
[ Diff preview table ]     Grants: N | Revokes: M | Unchanged: K | Errors: E
[ Apply N changes ]        disabled until preview is clean / overrides set
[ Result panel ]           Inserted X | Deleted Y | Failures Z (per-batch detail)
```

All loading, empty, error, and partial-success states have explicit UI — no silent toasts-only failures.

## Files to change

- `src/services/iac/iacService.ts`
  - New `exportRoleMatrix(): Promise<{ headers: string[]; rows: MatrixRow[] }>` using `fetchAllPaged` for both `profiles` and `iac_user_role_assignments`.
  - New `applyMatrixDiff(diff): Promise<{ inserted, deleted, errors }>` with batched insert/delete + audit.
  - Keep `exportAssignments` for the "Advanced" button.
- `src/lib/iac/csv.ts`
  - `serializeMatrixCsv(headers, rows)` (handles dynamic role columns).
  - `parseMatrixCsv(text, validRoleCodes)` returning `{ rows, errors }`.
  - `diffMatrix(parsed, currentAssignments)` returning the four buckets above.
- `src/hooks/useIac.ts`
  - `useExportRoleMatrix`, `useApplyMatrixDiff`.
- `src/pages/admin/IdentityAccessConsole.tsx` — replace the BulkTab body with the new download / upload / diff / apply flow described above. Keep "Advanced (long-form)" behind a small secondary button.
- `src/test/iac/bulkCsv.test.ts` — extend with: matrix serialize round-trip, parser rejects unknown headers/values, diff produces correct grant/revoke/unchanged buckets, inactive-user warning path, all-2532-employees export volume sanity test (mocked).
- `DOCUMENTATION.md` and `mem/architecture/security/identity-access-console.md` — document the matrix CSV contract and that long-form remains for scoped grants.

## Risk & Impact

- **Data:** Writes are scoped to `iac_user_role_assignments` only and only for `scope_type='global'`. Non-global rows are explicitly excluded from diff → no risk of clobbering scoped grants. Two-step preview-then-apply prevents accidental mass revoke.
- **Workflow:** Same RBAC surface; Bulk tab UX changes only.
- **UI/UX:** Bulk tab redesigned; other tabs untouched.
- **Regression:** Long-form export retained behind "Advanced" so any external script depending on the old format keeps working. Tests cover serialize/parse/diff and large-volume pagination.
- **Mitigation:** Unit tests for every new helper; admin must click "Apply N changes" after seeing the diff; per-batch error reporting; audit row written for every apply.

After approval I will implement and ship with passing tests.