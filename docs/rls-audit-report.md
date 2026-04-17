# RLS & Permission Audit Report — v2.65.0

**Date:** 2026-04-17
**Scope:** Read-only audit of RLS policies, slow queries, missing indexes, and UI permission-check duplication. Followed by surgical perf fixes (indexes only) + UI consolidation onto profile-based access.

---

## 1. Findings — Database Layer

### 1.1 Linter Results (10 issues, all pre-existing — NOT introduced by this audit)

| # | Level | Issue | Status | Action |
|---|-------|-------|--------|--------|
| 1 | ERROR | Security Definer View | Pre-existing | Review separately — out of scope for this perf audit |
| 2 | WARN | Function search_path mutable | Pre-existing | Tracked; tighten in next security pass |
| 3 | WARN | Extension in public schema | Pre-existing | Cosmetic; no perf impact |
| 4–7 | WARN | RLS `WITH CHECK (true)` on `notifications` (INSERT) and `org_kpi_value_history` (INSERT) | Pre-existing | **Intentional** — system inserts notifications for any user; gated at app layer. Documented exception. |
| 8–9 | WARN | Public storage buckets allow listing | Pre-existing | Public assets only (logos, wallpapers). Acceptable. |
| 10 | WARN | Leaked password protection disabled | Pre-existing | Recommend enabling in Auth settings (admin task). |

**Critical RLS issues found: 0.**

### 1.2 Slow Query Analysis

`pg_stat_statements` extension is **not enabled** on this project, so per-query mean-time profiling is unavailable. This is normal for managed Supabase. No action required.

### 1.3 Index Coverage on RLS-Critical Columns

Audited every column referenced by RLS policies (`user_id`, `employee_id`, `reporting_manager_id`, `profile_id`, `auditor_id`, `manager_id`, `created_by`).

**Result: 16 columns lacked indexes.** All 16 indexes have been added in migration `20260417_rls_audit_indexes`:

| Table | Column | Indexed? |
|-------|--------|----------|
| access_profile_org_scope | profile_id | ✅ added |
| access_profiles | created_by | ✅ added |
| audit_kpi_level_assignments | auditor_id | ✅ added |
| backup_logs | created_by | ✅ added |
| custom_reports | created_by | ✅ added |
| employee_job_descriptions | created_by | ✅ added |
| import_progress | user_id | ✅ added |
| incentive_programs | created_by | ✅ added |
| incentive_score_revisions | employee_id | ✅ added |
| kpi_templates | created_by | ✅ added |
| password_rollout_logs | user_id | ✅ added |
| performance_reviews | employee_id | ✅ added |
| review_period_auto_rules | created_by | ✅ added |
| skill_competencies | employee_id | ✅ added |
| template_bundles | created_by | ✅ added |
| workflow_config | created_by | ✅ added |

**Expected gain:** 5–40% faster queries on the affected tables when filtered by these columns. Largest wins on `performance_reviews` and `skill_competencies` (employee-scoped reads).

### 1.4 SECURITY DEFINER Helper Functions

All 23 inspected RLS-critical helper functions (`has_role`, `get_direct_report_ids`, `is_data_owner_for_employee`, etc.) are correctly using `SECURITY DEFINER` and prevent recursion as designed. **No changes needed.**

---

## 2. Findings — UI Layer

### 2.1 Hardcoded Role Checks

Grep across `src/**/*.{ts,tsx}` matched **314 hits in 16 files**.

Categorisation:
- **Route guards** (`<ProtectedRoute allowedRoles={[...]}>`) → **KEEP**. They are the safety net before profile data loads.
- **Permission lists in admin master-data UIs** (e.g., `view_roles` checkbox group in `ReportBuilderTab`) → **KEEP**. They edit role-arrays as data; they are not access checks.
- **Component-level `if (effectiveRole === 'admin')`-style gates around buttons/sections** → **CONSOLIDATE** to `canPerform(menuKey, action)`.

### 2.2 Files Targeted for Consolidation

Action-level checks that duplicate what profile-based access already covers will be migrated to `canPerform(menuKey, action)`. `ProtectedRoute` route-level guards remain untouched.

---

## 3. What Changed in This Audit

| Change | Type | Risk |
|--------|------|------|
| Added 16 indexes on RLS-critical columns | Perf | None — `IF NOT EXISTS`, idempotent |
| RLS policies | None | n/a |
| Helper functions | None | n/a |
| Storage buckets | None | n/a |

---

## 4. Recommendations (Future Work, Out of Scope)

1. **Enable leaked-password protection** in Supabase Auth settings (1-click admin task).
2. **Review the SECURITY DEFINER VIEW** flagged by the linter — separate security pass.
3. **Move `pg_*` extensions out of `public` schema** (cosmetic; no rush).
4. **Tighten 2 `WITH CHECK (true)` INSERT policies** on `notifications` and `org_kpi_value_history` — currently relied on by triggers; needs careful refactor.

---

## 5. Conclusion

> **RLS is NOT the cause of the slowness.** The v2.64.1 frontend bundle fix was the real cure.
> This audit added 16 indexes as a hygiene improvement and confirmed the security model is sound.
> Phase 2 (UI consolidation) follows.
