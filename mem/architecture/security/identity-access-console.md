---
name: Identity & Access Console
description: IAC Bulk uses a per-user × per-role matrix CSV by default; long-form (scoped) export remains under "Advanced".
type: feature
---

The Identity & Access Console at `/admin/iac` ships TWO bulk modes:

1. **Role Matrix (recommended)** — one CSV row per active employee, one column per active role.
   - Cell `Y` (case-insensitive) = grant at `scope_type=global`. Blank/`N`/`-` = revoke.
   - Identity columns `employee_code, email, full_name, is_active` are read-only context.
   - Lookup precedence on upload: **email first, then employee_code**.
   - Diff preview shows toGrant / toRevoke / unchanged / errors before any write.
   - Apply runs batched inserts AND batched deletes by `assignment_id` (chunks of 500), so non-`global` scoped grants are never touched.
   - Per-batch failures are captured and shown in a result panel (no silent fail). Audit row `assignment.bulk_matrix_apply` is always written.
   - Inactive users are blocked unless the admin enables the "Include inactive users" override.

2. **Advanced (long-form)** — original `email, role_code, scope_type, scope_id, expires_at` shape, kept for scoped grants.

Download path uses `fetchAllPaged` for both `profiles` and `iac_user_role_assignments` so the export is never silently truncated by the 1000-row PostgREST cap (the prior bug that caused "only a few users showing").

Files:
- `src/lib/iac/csv.ts` — `serializeMatrixCsv`, `parseMatrixCsv`, `diffMatrix`, `matrixTemplateCsv`.
- `src/services/iac/iacService.ts` — `exportRoleMatrix`, `loadMatrixLookups`, `applyMatrixDiff`.
- `src/hooks/useIac.ts` — `useExportRoleMatrix`, `useLoadMatrixLookups`, `useApplyMatrixDiff`.
- `src/pages/admin/IdentityAccessConsole.tsx` — `MatrixBulkTab` (default) + `LongFormBulkTab`.
- Tests: `src/test/iac/bulkCsv.test.ts`.
