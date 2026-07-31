# Master Change History Report (ADR-213)

A single admin report that answers "what changed, when, and who did it" across employee master data, active/inactive status, and workflow mapping.

## Current state (verified)

- `system_audit_logs` (11,082 rows) records `profile.identity_changed` — but only for 4 fields: full name, employee code, email, is_active. Department, designation, reporting manager, functional manager, grade, level, location, DOJ, category changes are **not** captured anywhere.
- `employment_status_history` (2,689 rows) captures employment status transitions with `changed_by` / `changed_at`.
- `workflow_config` (397 rows, PMS workflow mapping by employee / department / pms_grade) has **no** change log at all — only `created_by` and `updated_at` on the live row. Every past mapping update is unrecoverable.
- Annual-review reviewer reassignments are recorded in `annual_review_assignment_overrides` and various `annual_review.*` actions in `system_audit_logs`.

So two capture gaps must be closed before the report can be complete, and history before today cannot be reconstructed for workflow mapping.

## What gets built

### 1. Capture layer (database)

- Extend the profiles audit trigger to log **every** business-relevant column change (department, designation, reporting manager, functional manager, pms grade, level, location, category, DOJ, mobile, portal access, is_active, employment status, email, name, code) as `profile.field_changed` rows in `system_audit_logs`, with a `changed_fields` array plus before/after per field.
- New audit trigger on `workflow_config` (INSERT / UPDATE / DELETE) writing `workflow.mapping_changed` with config type, target (employee / department / grade), old and new workflow template, period scope, and actor.
- Both write to the existing immutable `system_audit_logs` (no updates, no deletes, admin-only read) — no new audit store, no change to existing rows.

### 2. Report (`/reports/change-history`)

Server-side paginated table (page size 50) over a new `get_change_history(...)` RPC that unions:

| Category | Source |
|---|---|
| Employee details | `system_audit_logs` → `profile.field_changed` / `profile.identity_changed` |
| Active / Inactive | is_active changes + `employment_status_history` |
| Workflow mapping | `workflow.mapping_changed` |
| Annual review reviewer / template changes | existing `annual_review.*` audit actions |

Columns: Date & time, Category, Employee (name + code), What changed (field), Old value, New value, Changed by, Source/context.

Filters: date range, category, employee search, changed-by, department. Excel export of the current filter set (server-paginated fetch, capped and warned per the large-export policy).

Access: Admin and HR PMS can view; Admin can export. Registered in the reports hub and report registry.

### 3. Tests and docs

- Unit tests for the diff-formatter (field labels, old/new rendering, id → name resolution) and RPC filter shaping.
- ADR-213, POLICY §CHG-HISTORY-SSOT, DOCUMENTATION.md version entry, memory note.

## Technical notes

- Value rendering resolves foreign keys (department_id, manager ids, template ids) to names at read time via lookup joins in the RPC, so the report never shows raw UUIDs.
- The RPC is SECURITY DEFINER with an explicit admin/hr_pms role check, keyset/offset pagination and a hard row cap; audit tables stay admin-RLS-only.
- Purely additive: new trigger + new RPC + new page. Rollback = drop the trigger and route; no existing behaviour changes.

## Known limitation

Workflow mapping changes made **before** this trigger goes live cannot be shown — there is no historical record to read. The report will state the capture start date so the gap is explicit rather than silently empty.
