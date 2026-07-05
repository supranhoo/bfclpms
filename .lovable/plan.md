## Why you can't roll it back today

Looking at the row you screenshotted (stage = **Completed**, Final = 100.00), the row-actions menu in `AnnualReviewAdmin.tsx` only exposes:

- **Finalize / View** — always shown
- **Step back to previous stage** — only when `overall_status ∈ {pending_manager, pending_skip, pending_dept, pending_bu, pending_hr}`
- **Change template / workflow / weights** — only when status is `not_started` or `pending_self`

Your instance is `completed` (all stages done, awaiting HR finalize) or already `finalized`. Neither state is in the step-back map and neither is in the "canChange" set, so **no rollback action is rendered** — that's the whole reason nothing happens.

Separately, the KPI-style `kpi_rollback_requests` flow (the banner + approve/reject you saw in monthly PMS) was **never wired to annual review instances** — it targets `kpis.id`, not `annual_review_instances.id`.

So the gap is a missing feature, not a bug.

---

## Plan — add rollback for Completed & Finalized instances

### 1. Row action (admin-only)
In the row dropdown, add a new item **"Roll back stage"** visible when:

- `overall_status = 'completed'` → target = last non-HR stage that actually has a score (bu_head → dept_head → skip_manager → manager → self)
- `overall_status = 'finalized'` → target = `completed` (un-finalize), then admin can step further back

Existing "Step back to previous stage" stays untouched for pending_* states.

### 2. Confirmation dialog
Reuse `ConfirmDestructiveDialog`. Require a **reason** (min 3 chars). Show the resolved target stage and warn that:

- Downstream scores for stages after the target will be **cleared** (kept in audit log, not deleted from history table).
- `finalized_at`, `final_rating`, `total_score` are nulled when un-finalizing.

### 3. Service layer
Add `svc.rollbackInstance({ instanceId, targetStage, reason })` in `src/services/annualReview` that:

1. Reads current instance + response rows.
2. Clears stage responses **after** target (via existing `annual_review_responses` writer).
3. Sets `overall_status` = the pending stage that logically follows the target (e.g. rollback to `bu_head` → `pending_hr` becomes `pending_hr`... actually rollback to manager → `pending_skip`, etc.).
4. If un-finalizing: nulls `finalized_at`, `final_rating`, `total_score`, `rating_override_*`.
5. Writes an immutable row into `annual_review_audit_log` (existing table) with `action='rollback'`, actor, reason, from-status, to-status.

All in a single Supabase RPC to stay atomic — new SECURITY DEFINER function `annual_review_rollback_instance(p_instance_id, p_target_stage, p_reason)`.

### 4. RLS / permissions
Only `admin` and `hr_pms` roles may invoke the RPC (checked via `has_role`). Non-admins keep seeing no rollback option.

### 5. UI feedback
- Optimistic invalidation of the instances query + stage-scores map.
- Toast: "Rolled back to Manager stage. Reason logged."
- The row's Stage badge updates to the new `pending_*` state, and step-back becomes available again.

### 6. Tests & docs
- Unit test for the target-stage resolver (10 stage combinations, incl. finalized → completed).
- SQL test that the RPC refuses without admin/HR role.
- Update `docs/specs/annual-review-template-factory.md` § Rollback and `mem://features/annual-review/operations.md`.

### Risk & impact

| Area | Risk | Mitigation |
|---|---|---|
| Data | Clearing downstream stage scores | Kept in `annual_review_audit_log`; not hard-deleted from response history |
| Workflow | Employee could re-open a finalized packet mid-appraisal cycle | Admin/HR-only, reason mandatory, audit-logged |
| UI | Confusion with existing "Step back" | New item labelled **"Roll back to earlier stage"** with sub-menu; step-back item unchanged |
| Regression | Might affect monthly KPI rollback path | Totally separate table + RPC namespace |

### Out of scope
- No change to monthly KPI rollback.
- No bulk rollback (single row only, matches the screenshot pattern).
- No employee-initiated rollback request flow — admin/HR action only.

---

**Approve to implement**, or tell me if you'd rather (a) keep it admin-only vs. also allow HR PMS, (b) support bulk rollback across selected rows, or (c) require a two-person approval like the KPI rollback request flow.
