---
name: Safety Role Bulk Management
description: CSV bulk import + export for safety_user_roles via SafetyUsers page
type: feature
---
Phase 5 enhancement to `/safety/settings/users`. Adds:
- **Export** — downloads current `safety_user_roles` rows (visible to caller via RLS) as `employee_code,email,role,assigned_at` CSV.
- **Bulk import** — `SafetyRoleImportDialog` parses CSV, resolves each row to a profile (employee_code preferred, email fallback), then calls existing `grant-safety-role` edge function per row sequentially. Preserves audit trail + idempotency.

Rules:
- Max 500 rows per file (matches PMS import policy).
- Role must be one of `ALL_SAFETY_ROLES`; case-insensitive on input.
- Dedupes identical `(identifier, role)` pairs in the same file.
- Only `is_active = true` profiles are matched.
- Never touches `grant-safety-role` server logic — that function already provisions auth users and authorizes the caller.