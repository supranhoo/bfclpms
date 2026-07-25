## Root cause (5-Why)

Saving "Edit workflow & reviewers" in **supersede** mode calls `annual_review_edit_workflow` → `set_annual_review_enabled_stages` → `reassign_annual_review_reviewer`. All three write an audit row like:

```sql
INSERT INTO public.annual_review_access_audit(action, actor_id, target_id, metadata) ...
```

But the live table only has: `id, actor_id, target_user_id, action, before, after, reason, created_at`. There is no `target_id` and no `metadata` column — so PostgREST returns `column "target_id" of relation "annual_review_access_audit" does not exist` and the entire supersede save is rolled back.

- Why did the error appear now? Supersede path is the only branch that always writes these audit rows (the safe path skips them when nothing rewinds).
- Why do the functions use the wrong column names? Migration `20260724122536` and `20260724123142` (ADR-160/160b) were authored against a proposed audit schema that was never applied — the table still has the older `target_user_id` + `before/after/reason` shape.
- Why wasn't it caught? No supersede save was exercised end-to-end after ADR-160b landed; the code path only fires when a completed review is re-opened with REPLAN.

## Fix (one migration, no UI/logic change)

Rewrite the three offending INSERTs to use the real columns. Map:
- `target_id`  → `target_user_id` (set to the **instance's employee_id**, which is what all other audit rows use — resolve via `SELECT employee_id FROM annual_review_instances WHERE id = p_instance_id`).
- `metadata`   → `after` (jsonb), keeping the same jsonb payload.
- `reason`     → populate from `p_reason` so admins can filter by it.

Functions to replace (CREATE OR REPLACE, signatures unchanged):
1. `public.set_annual_review_enabled_stages(uuid, jsonb, text, text)` — fix the audit INSERT at the tail.
2. `public.reassign_annual_review_reviewer(uuid, text, uuid, text, text)` — fix the supersede-branch audit INSERT.
3. `public.annual_review_edit_workflow(uuid, jsonb, jsonb, text, text)` — fix the summary audit INSERT.

No other behavior changes; no schema changes; RLS unaffected (policies are role-based, not column-based).

## Verification

- Re-run Balram Mahto REPLAN save from the "Edit workflow & reviewers" dialog — expect success toast, status rewinds `completed → pending_bu`, notifications fire.
- `SELECT action, target_user_id, after, reason FROM annual_review_access_audit WHERE action IN ('workflow_edited_post_action','reviewer_reassigned_supersede') ORDER BY id DESC LIMIT 5;` — expect three rows for the save with correct instance/employee mapping.
- Run a safe-mode edit on another instance — still works (no regression).

## Risk & Impact

- Data: additive only; existing rows untouched. No schema change.
- Workflow: unblocks supersede saves that are currently 100% failing.
- Regression: low — only INSERT column list changes in three RPCs.
- Rollback: drop the new migration and previous functions come back (still broken, but no data loss).

## Docs

- POLICY §AR-EDIT-WORKFLOW-AUDIT: audit rows for `workflow_edited_post_action` and `reviewer_reassigned_supersede` write `target_user_id = instance.employee_id`, payload in `after`, reason in `reason`.
- ADR-167: audit-column mismatch fix for ADR-160/160b RPCs.
