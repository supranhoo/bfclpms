# Plan — Bulk Approve: Custom Remark + Shared Evidence + Guaranteed Advance

Enhance the **Bulk Approve (Mgmt)** dialog on `/review/bulk-scoring` so reviewers can (a) add a batch remark, (b) attach shared supporting evidence, and (c) **be guaranteed the cell advances to terminal `approved` state — no stuck-in-pending rows**.

## Today's behaviour (baseline)
- Dialog has only Cancel / Approve.
- Reason hardcoded as `"Bulk approval from dashboard"`.
- No attachment path; evidence must pre-exist on the submission.
- Post-approve: cell stamps `final_score` per POLICY §88 (Auditor → HR PMS → Skip-Level → Manager). Workflow status should jump to `approved`, but today partial RPC failures can leave a cell `pending` with a stamped score → **stuck row**.

## Risk & Impact

| Area | Impact |
|---|---|
| Data | Adds rows to `review_submission_attachments` keyed by `bulk_batch_id`. No destructive schema change. |
| Workflow | Status **must** transition `pending → approved` for every applied cell in the same DB transaction as the score stamp. Skipped cells stay untouched. |
| UI/UX | Confirm dialog becomes a small form (remark + dropzone). Post-approve, refreshed grid shows cells move out of PENDING badge into `APPROVED` (green) and disappear from the "pending" filter. |
| Regression | Low — single bulk RPC, additive params. Single-cell path untouched. |
| Scalability | Cap unchanged (≤25 cells/batch). Files: ≤5 × ≤10 MB. |
| Rollback | Additive; new columns/params optional. |

## UI changes

Location: `src/pages/review/BulkReviewDashboard.tsx` confirmation dialog (~line 750).

```text
┌─ Bulk approve 7 cells? ─────────────────────────┐
│ Final scores stamp from highest-priority         │
│ completed stage (Auditor > HR PMS > Skip > Mgr). │
│ Per Policy §88, immutable except via Re-open.    │
│                                                  │
│ Remark (required, ≥10 chars)        [0 / 500]    │
│ ┌──────────────────────────────────────────────┐ │
│ │ Approved after Q-review meeting on 25 May…  │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ Supporting evidence (optional, up to 5 files)    │
│ ┌──────────────────────────────────────────────┐ │
│ │ 📎 Drop files or click to upload             │ │
│ │ • MoM_25May2026.pdf  ✕                       │ │
│ └──────────────────────────────────────────────┘ │
│ Files attached to all 7 approved cells.          │
│                                                  │
│              [ Cancel ]   [ Approve 7 cells ]    │
└──────────────────────────────────────────────────┘
```

Post-approve UX:
- Toast: `Approved X / N · Y advanced to APPROVED` (and if any skipped: `Z skipped — see audit log`).
- Grid auto-refreshes; approved cells lose the `PENDING` chip and render in green/approved styling.
- Selection cleared; "X selected" tray hidden.

## Guaranteed Advancement (anti-stuck contract)

This is the core of this addendum. The bulk RPC must enforce:

1. **Atomic per cell**: `final_score` stamp + `status → approved` happen in a single `UPDATE review_submissions … SET final_score=…, status='approved', approved_at=now(), approved_by=auth.uid()` inside one transaction. No two-step writes.
2. **All-or-nothing per cell**: if the status transition fails RLS or workflow validation, the score stamp is **rolled back** for that cell so it stays `pending` cleanly — never `pending` with a stamped score.
3. **Batch reporting**: RPC returns `{ applied: uuid[], advanced: uuid[], skipped: [{ id, reason }] }`. Client asserts `applied == advanced`; any divergence triggers a hard error toast (`"N cells stamped but not advanced — escalate to admin"`) and an `system_audit_logs` row with `action='bulk_advance_drift'`.
4. **Post-commit reconcile**: after the RPC returns, the client refetches the same N submission IDs and verifies `status='approved'`. Any row still `pending` → fired into the workflow reconciliation queue (existing job, see `mem://features/admin/workflow-reconciliation-logic`).
5. **Notifications fire from advance, not stamp**: the existing `Workflow Engine Notification Triggers` already fires on status change → reusing it guarantees no "approved silently" cells.
6. **Idempotency**: `bulk_batch_id` is unique; replay of the same batch is a no-op (already-approved cells become `skipped: 'already_terminal'`, not double-stamped).

## Implementation steps

1. **Frontend dialog** — new `src/components/review/BulkApproveDialog.tsx`:
   - Props: `open`, `cellCount`, `onCancel`, `onConfirm(reason, files)`, `isLoading`.
   - Validates `reason.trim().length >= 10`; disables Approve otherwise.
   - File chips with remove; total-size guard.
   - Replaces inline `ConfirmDialog` in `BulkReviewDashboard.tsx`.

2. **Frontend handler** (`handleBulkApprove`):
   - Generate `batch_id = crypto.randomUUID()`.
   - Upload files to `bulk-approve/{batch_id}/{filename}` via existing multi-file evidence helper.
   - Call `approve.mutateAsync({ cells, reason, attachment_paths, batch_id })`.
   - On response: invalidate snapshot + preview queries, refetch the touched submission IDs and assert `status='approved'`; surface drift toast if any row mismatched.

3. **Backend RPC** (`bulk_advance_workflow_stage` / mgmt-bulk variant):
   - New params: `_reason text NOT NULL CHECK (length(trim(_reason)) >= 10)`, `_attachment_paths text[] DEFAULT '{}'`, `_batch_id uuid NOT NULL`.
   - For each candidate cell, in a single statement:
     ```sql
     UPDATE review_submissions
        SET final_score = <resolved_top_score>,
            status      = 'approved',
            approved_by = auth.uid(),
            approved_at = now(),
            updated_at  = now()
      WHERE id = _id
        AND status <> 'approved'
        AND <stage chain has a completed score>
     RETURNING id;
     ```
     - Row returned → counted as `applied` **and** `advanced`.
     - No row → classified into `skipped` with reason (`already_terminal`, `no_upstream_score`, `rls_denied`, `period_locked`).
   - Insert attachment rows linked to `batch_id` + each `applied` submission.
   - Insert one `system_audit_logs` parent row with `action='bulk_management_approval'`, `metadata={ batch_id, applied_count, skipped_breakdown, attachment_count, reason }`.
   - Mirror existing POLICY §88 guards; SECURITY DEFINER.

4. **Post-RPC reconcile guard (server-side)**:
   - At end of RPC, re-SELECT the applied IDs and assert all have `status='approved'`. If any drift, write `action='bulk_advance_drift'` row and surface in returned payload so client can hard-fail.

5. **Tests**
   - Unit (dialog): validation, disabled states, payload shape.
   - Unit (handler): upload-then-call ordering, drift toast on mismatch.
   - RPC (pgTAP):
     - Happy path → N rows applied, all advanced.
     - One cell with no upstream score → skipped, others advance.
     - Locked period → cell skipped, no score stamp.
     - Replay same `batch_id` → no double stamp, no extra attachment rows.
     - Force advance-failure (simulated trigger) → score rollback verified.
   - Mock data: bulk fixture with mix of upstream-scored, unscored, and already-approved cells.

6. **Docs & memory**
   - `DOCUMENTATION.md` → Bulk Review section: remark, evidence, "approved = terminal" guarantee.
   - `POLICY.md` §88 addendum: bulk approval (i) requires ≥10-char remark, (ii) writes shared evidence, (iii) **must atomically advance status; partial advancement is a defect, not an allowed state**.
   - `ADR-064` v1.2: RPC signature change + advancement contract.
   - Update `mem://features/review/management-bulk-approval` with the anti-stuck contract.

## Technical notes
- **Orphan files**: if RPC fails entirely, uploaded files swept by existing storage GC.
- **Performer**: real user (not NULL) — human-initiated.
- **No realtime**: grid still refreshes via manual Refresh + post-approve invalidation (per Phase-2 lean-load policy).

## Not in scope
- Per-cell remarks within a batch.
- Editing/removing batch evidence after approval (use Re-open).
- Extending to Manager/HR PMS bulk paths (separate ticket once UX validated).
