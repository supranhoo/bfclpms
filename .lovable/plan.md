## Issue
Rolling back Anup Kumar Jha (101708, instance `c293ebc0…9562`) fails with:
`terminal response (bu_head) missing for instance …; cannot roll back cleanly`

## Evidence
- `annual_review_instances`: `overall_status='completed'`, `enabled_stages=[self, dept_head, bu_head]`, `dept_head_id = bu_head_id` (same person heads both).
- `annual_review_responses`: only `self` (locked) and `dept_head` (locked, submitted 2026-07-18 11:05:29 — matches `finalized_at`). No `bu_head` row exists.
- `rollback_annual_review_completed` (ADR-129, migration `20260720162430`) picks the highest-seniority stage in `enabled_stages` (`bu_head`), tries to unlock that response, sees `ROW_COUNT=0`, and aborts.

## 5-Why RCA
1. Why does rollback fail? RPC can't find a `bu_head` response to unlock.
2. Why is it missing? The finalization was recorded under `dept_head` even though the workflow's terminal stage is `bu_head`.
3. Why under `dept_head`? When `dept_head_id = bu_head_id`, the advance path submitted at the `dept_head` seat (older workflow, before BU-terminal collapsing was consistent) and jumped straight to `completed` without materializing a `bu_head` response row.
4. Why didn't the resolver notice? It reads only `enabled_stages`, not the actual `annual_review_responses` present on the instance — so it commits to a stage that has no row.
5. Why is this a class bug? Any instance where the true last-reviewer response lives under a stage lower than the highest enabled stage (dept/BU collapse, HR skipped, inactive higher reviewer, legacy fast-forward) will hit the same guard.

## CAPA — Corrective Action
Make the terminal-stage resolver **evidence-based** instead of purely `enabled_stages`-based.

### 1. Patch `rollback_annual_review_completed` (new migration)
- Compute `v_terminal_stage` as: **the highest-seniority reviewer role that BOTH is present in `enabled_stages` AND has a locked/submitted row in `annual_review_responses` for the instance**.
- Fallback order (unchanged): hr → bu_head → dept_head → skip_manager → manager.
- Map to the correct `pending_*` status from the chosen stage.
- Keep the existing "unlock terminal-stage response" step; the guard now only trips for genuinely orphaned instances (which should be impossible after this fix).
- Preserve every other side-effect (null out `final_rating`, `hr_remarks`, `finalized_at`, `finalized_by`, `total_score`, `criteria_weighted_score`; audit log; admin/hr_pms only; ≥3-char reason; SECURITY INVOKER; same GRANT).
- Audit metadata gains `enabled_terminal_stage` (what `enabled_stages` said) alongside `terminal_stage` (what was actually rolled back to) so operators can spot collapse cases.

### 2. Mirror the resolver in TS
- Update `src/lib/annualReview/rollbackTerminalStage.ts` to accept an optional `submittedReviewerRoles` set and pick the highest-seniority stage present in **both** enabled and submitted. Keep the existing enabled-only signature as a fallback overload so nothing else breaks.
- Update `rollbackTerminalLabel` similarly so the confirm dialog copy ("return the instance to **pending BU Head**") stays truthful when the effective terminal collapses to Dept Head.
- Wire the caller (Admin → Progress rollback dialog) to pass the response-role set it already has from the instance detail query. If it isn't fetched yet, keep the enabled-only label as a graceful default.

### 3. One-shot repair block in the same migration
- For every `completed` instance where the resolver's new evidence-based pick differs from the old enabled-only pick (i.e. would previously have failed), do nothing destructive — just log a `system_audit_logs` row of type `annual_review.rollback_terminal_stage_mismatch` with `{instance_id, enabled_terminal_stage, effective_terminal_stage}` so we can size the blast radius. No data mutation, no `performed_by` (system row, per repo convention).

### 4. Regression test
- Add `src/lib/annualReview/rollbackTerminalStage.test.ts` cases:
  - enabled=[self,dept,bu], submitted={self,dept} → returns `dept_head` / label "pending Department Head".
  - enabled=[self,manager,skip,dept,bu,hr], submitted={…,hr} → returns `hr`.
  - enabled=[self], submitted={self} → returns `null` (unchanged).

## Not touched
- `enabled_stages` on the instance — not mutated. BU-terminal enforcement (ADR-109) and dept/BU collapse rules stay as-is.
- No changes to advance/send-back RPCs, RLS, notifications, or the finalization path.
- No backfill of missing `bu_head` response rows — that would fabricate history.

## Verification (post-approval)
- Run the patched RPC against `c293ebc0…9562` with the reason typed in the screenshot. Expect return `pending_dept`, `dept_head` response row unlocked, `final_rating/finalized_at/finalized_by/total_score/criteria_weighted_score` cleared, audit log written with both stage values.
- Confirm the confirmation dialog now reads "pending Department Head" for this instance.
- Query the new `rollback_terminal_stage_mismatch` audit rows to list any other collapsed instances.

## POLICY / ADR
- New **ADR-136 — Evidence-based terminal stage for finalized-review rollback** amending ADR-129.
- POLICY §AR-ROLLBACK-TERMINAL-STAGE updated: terminal stage = highest-seniority role present in both `enabled_stages` **and** submitted `annual_review_responses`.

## Risk & rollback
- Additive migration; the previous RPC body is fully replaced (idempotent CREATE OR REPLACE). Rollback = re-run the ADR-129 migration to restore the enabled-only resolver.
- No schema change, no RLS change, no data mutation outside the caller's own instance during rollback.
