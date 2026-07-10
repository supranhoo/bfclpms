## Goal

Make two admin changes flow into already-seeded Annual Assessment forms of the **current active cycle**:

1. Edits to a **published template** (criteria / weights) → propagate to open instances.
2. **Department Head change** → refresh `dept_head_id` on all non-finalized instances of that department.

---

## Risk & Impact Report

| Area | Assessment |
|---|---|
| Data | Rewrites `dept_head_id` on live `annual_review_instances`; touches `annual_review_criteria_assignments` snapshot for open instances. Finalized rows never touched. |
| Workflow | Reviewer at the `dept_head` stage may change if the current reviewer hasn't acted yet. If dept_head stage already actioned, we keep the old approver (audit trail) and only rewrite pending/downstream. |
| UI/UX | Two new admin-only actions on existing pages — no layout shift. |
| Regression | Bounded by cycle-id, non-finalized filter, and per-department scope. Mirrors the one-off Admin-Pollution migration pattern. |
| Rollback | Both actions are additive; audit log rows (`annual_review.dept_head.resynced`, `annual_review.template.resynced`) capture prior values for manual revert. |
| Scalability | Single UPDATE ... WHERE cycle_id = … AND department = …; O(instances in dept). |

---

## What to Do (User-facing)

### A. Template criteria/weights re-sync
Admin → Annual Review → **Templates** tab → row action **"Re-sync open instances"** (new).
- Runs only for current active cycle.
- Rewrites `annual_review_criteria_assignments` snapshot on instances where `overall_status ∈ (not_started, pending_self)` — i.e. self-review not submitted.
- Skips instances past self-submit to protect already-entered scores; those are listed in a "Skipped" summary so admin can decide case-by-case.

### B. Department Head resync
Admin → **Departments** tab → Head column → new **"Re-sync open reviews"** action next to the head picker.
- Runs only for current active cycle.
- Rewrites `dept_head_id` on every non-finalized instance whose employee is in that department AND whose stage hasn't yet reached `dept_head` completion.
- Instances already approved by the previous dept head are left untouched.

Both actions require admin/hr_pms, log to `system_audit_logs`, and show a confirm dialog with the affected count before running.

---

## Technical Plan

### Migration (single file)

1. `public.resync_annual_review_dept_head(p_cycle_id uuid, p_dept_id uuid)`
   - `SECURITY DEFINER`, admin/hr_pms only.
   - `UPDATE annual_review_instances SET dept_head_id = departments.head_user_id` WHERE cycle + dept + `finalized_at IS NULL` + dept_head stage not yet completed.
   - Returns `{updated int, skipped int}`.
   - Inserts one `system_audit_logs` row per invocation.

2. `public.resync_annual_review_template_criteria(p_cycle_id uuid, p_template_id uuid)`
   - Admin/hr_pms only.
   - For open instances (`overall_status IN ('not_started','pending_self')`) on this template in this cycle: delete + re-insert their `annual_review_criteria_assignments` from `annual_review_templates` current criteria.
   - Skips instances past self-submit; returns skipped ids for UI.
   - Audit log `annual_review.template.resynced`.

Grants: `EXECUTE ... TO authenticated` (role gate is inside SECURITY DEFINER body).

### Service layer

`src/services/annualReview/resync.ts`
- `resyncDeptHead(cycleId, deptId)`
- `resyncTemplateCriteria(cycleId, templateId)`
- Both wrap the RPCs, invalidate the same query keys as `reassignReviewer`.

### UI

- `src/components/admin/OrgHeadColumn.tsx` (scope='department'): add "Re-sync open reviews" menu item — calls `resyncDeptHead` with the current active cycle id (fetched via existing `useActiveCycle` hook or `annual_review_cycles` where `status='active'`). Uses `ConfirmDestructiveDialog`.
- Templates tab row action: "Re-sync open instances" → confirm → call `resyncTemplateCriteria`.

### Tests

- `src/test/annualReview/resyncDeptHead.test.ts` — 4 cases: happy path, finalized skipped, non-dept skipped, dept_head-completed skipped.
- `src/test/annualReview/resyncTemplateCriteria.test.ts` — 3 cases: not_started re-seeded, pending_self re-seeded, past self-submit skipped.

### Docs

- `docs/adr/ADR-106.md` — "Template & Dept Head resync into open Annual Review instances".
- Update `mem/features/admin/org-heads.md` with new RPC + UI.
- Update `.lovable/memory/features/annual-review/operations.md` — add resync note under Reassignment section.

---

## Deliverables

1. Migration with the two RPCs + audit action strings.
2. Service + hooks (`useResyncDeptHead`, `useResyncTemplateCriteria`).
3. UI actions on Templates row and Department Head column.
4. Vitest suites (7 cases total).
5. ADR-106 + memory updates.

No changes to finalized instances, no schema changes to `annual_review_instances`.