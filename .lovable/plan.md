## Goal

Add a reusable "Transfer response between stages" capability to `annual_review_edit_workflow` so admins can, from the existing **Edit workflow & reviewers** dialog:

- Reassign the BU Head slot on selected instances from **Umesh Kumar Singh (100600)** to **Bijay Kumar Mandal (101906)**, AND
- Preserve Umesh's already-locked BU Head response by re-attributing it as the **Dept Head** response on those same instances (dropping BU from `enabled_stages`), so the review does not go back to Bijay for a fresh score.

The mechanism must be generic (any role → any other role, any outgoing → incoming reviewer) so it can be reused whenever an org reshuffle demotes/promotes a reviewer mid-cycle.

---

## Risk & Impact Report

- **Data:** Rewrites `annual_review_responses.reviewer_role` on locked rows and mutates `enabled_stages` on affected instances. All prior values snapshotted into a new audit table `annual_review_stage_transfer_audit_2026_07` for full rollback.
- **Workflow:** Instances currently `completed` or past the BU stage stay completed (their locked response is simply re-labeled Dept Head; totals and final_score are untouched when the terminal role does not change). Instances still upstream of BU are unaffected.
- **UI/UX:** One new mode `"transfer"` in the existing Edit-workflow dialog — no new page. Amber notice explains the transfer semantics before Save. Dialog copy already handles supersede warnings; we extend the same panel.
- **Regression risk:** Touches the same RPC family repaired in ADR-167/168. Mitigated by (a) reusing the canonical `pendingStatusForRole` map, (b) new pure-function `computeStageTransferPlan()` with unit tests, (c) contract test on the RPC payload, (d) idempotency guard (no-op if source role already absent).
- **Scalability:** Per-instance action driven from the dialog; bulk apply is out of scope for this change (opt-in follow-up).
- **Rollback:** The audit table stores `before_enabled_stages`, `before_responses` JSONB, `before_status`; a `revert_stage_transfer(audit_id)` RPC restores them atomically.

---

## Plan

### Backend (single migration)

1. `annual_review_stage_transfer_audit_2026_07` table + RLS (admin/hr_pms read; SECURITY DEFINER writes). Grants per project rule.
2. `public.transfer_annual_review_stage_response(p_instance_id, p_from_role, p_to_role, p_new_reviewer_id null, p_drop_from_stage bool default true, p_reason text)` — SECURITY DEFINER, admin/hr_pms only:
   - Validates roles are canonical (`annual_review_role`) and different.
   - Loads the locked response for `p_from_role`; no-op + audit if none.
   - Re-attributes that response to `p_to_role` (`reviewer_role`, `reviewer_id` = existing to_role reviewer, keeps `submitted_at`, `scores_json`, `comments`).
   - If `p_drop_from_stage`, removes `p_from_role` from `enabled_stages` and nulls the corresponding `*_id` slot.
   - If `p_new_reviewer_id` given, sets the matching `*_id` slot for `p_from_role` (Bijay becomes new BU Head) — even when the stage is dropped from *this* instance, so future re-enable resolves cleanly.
   - If status was `pending_<from_role>`, advances to next `pending_<role>` per canonical `pendingStatusForRole` map (or `completed` if terminal). Leaves `completed` instances alone.
   - Writes one row to the audit table.
3. Extend `annual_review_edit_workflow(..., p_mode text)` to accept `p_mode='transfer'` with new args `p_transfer_from_role`, `p_transfer_to_role`, `p_drop_from_stage`, delegating to the RPC above inside the same transaction. Preserves existing `safe`/`supersede` behavior unchanged.
4. `revert_stage_transfer(p_audit_id uuid)` — SECURITY DEFINER admin-only inverse.

### Frontend (surgical, presentation-layer only)

1. `src/lib/annualReview/workflowEditImpact.ts` — add pure `computeStageTransferPlan({fromRole, toRole, currentStages, lockedResponses, currentStatus})` returning `{ willReattributeResponseFrom, willDropStage, statusAfter, warnings[] }`. No side-effects.
2. `src/services/annualReview/annualReviewService.ts` — new `transferAnnualReviewStage(...)` wrapper; extend `editAnnualReviewWorkflow` typing with `mode: 'transfer'` and transfer args.
3. `EditWorkflowReviewersDialog` (existing) — add a third mode radio **"Transfer response to another stage"**, source-role + target-role selects (limited to roles present in `enabled_stages` + roles the admin wants to add), optional "new reviewer for outgoing slot" combobox. Reuses existing amber warning panel with copy derived from `computeStageTransferPlan`.
4. Copy in `readOnlyReviewNotice.ts` (only if BU→Dept re-attribution changes the visible stage label) — no logic change.

### Tests (mandatory)

- `src/test/annualReview/stageTransferPlan.test.ts` — pure calculator: happy path (BU locked → Dept, stage dropped, status stays completed), no-op when no locked source response, error when roles equal, terminal-role transfer keeps `final_score`.
- `src/test/editWorkflowRpc.contract.test.ts` — extend with `mode:'transfer'` payload assertion.
- `src/test/annualReview/workflowStatusMapping.test.ts` — add case: post-transfer status resolution uses `pendingStatusForRole`.
- Mock data factories in `src/test/fixtures/annualReview.ts` (create if missing): `makeInstanceWithLockedResponse(role)`.

### Documentation & Policy

- `DOCUMENTATION.md` — new v2.66.169 entry with RCA/CAPA and the reusable mechanism.
- `POLICY.md` — new §AR-STAGE-RESPONSE-TRANSFER (invariants: same-cycle only, admin/hr_pms only, always audited, idempotent, revertible, does not mutate `final_score` unless terminal role changes).
- `docs/adr/ADR-169.md` — decision record cross-linking ADR-108 (cascade), ADR-142 (response migration on reviewer change), ADR-160 (supersede orchestrator), ADR-167/168 (canonical enum mapping).

### One-off application for the reported case

After the migration is approved, run the RPC for each of Umesh's affected instances via the dialog (or a small admin-only helper query that lists candidate instances where `bu_head_id = Umesh` and a locked BU response exists) with:

- `from_role='bu_head'`, `to_role='dept_head'`, `new_reviewer_id=<Bijay 101906>`, `drop_from_stage=true`, reason cites this ticket.

Also flip the BU-head master via existing `set_bu_head` RPC (Facility Mgmt → Bijay) so future cycles resolve correctly.

---

## Technical notes

- `annual_review_responses` has a UNIQUE constraint on `(instance_id, reviewer_role)`; the RPC deletes any pre-existing `p_to_role` row (should be none in the intended use) before UPDATE, and captures the deleted row into audit.
- `final_score` immutability (POLICY §88 / universal scoring) is preserved because the response payload — the source of truth for the score — is unchanged, only its `reviewer_role` label moves.
- Idempotent: re-running with the source role already absent is a no-op that still writes an audit row with `no_op=true`.
- BU-head-terminal trigger (ADR-109) will not re-strip Dept from these instances because after transfer the *incoming* BU Head (Bijay) is not the reviewee; the existing "employee is BU Head" precondition still applies correctly.
