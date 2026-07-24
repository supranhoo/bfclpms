## Diagnosis (verified against DB + code)

**Instance:** Jaspal (101125) — `01f168dd-4f07-44ea-b8bf-9fb20452a497`
- `overall_status = pending_management`
- `management_id = ef74c606…` (Dummy/001)
- `annual_review_responses`: `management` row is `is_locked=true, submitted_at=2026-07-24 06:50:59`, `weighted_score=0.00`
- `annual_review_effective_chain(...)` returns `["self","management"]` ✔
- `annual_review_next_status(["self","management"], 'pending_management')` returns **`pending_management`** ✗ (should be `completed`)

### Root cause — question 2 ("why submit didn't work")
`public.annual_review_next_status` (SQL, IMMUTABLE) was written before ADR-138 added the Management stage. It has two gaps:
1. Its seniority VALUES list stops at `('hr',6)` — no `management` row.
2. Its `p_current → v_cur` CASE doesn't map `pending_management`.

So `advance_annual_review_status` for a management submit:
- correctly locks the response row (that's why the toast said "Submitted"),
- then computes `v_next := annual_review_next_status(...)` → returns `pending_management` unchanged,
- updates the instance to the same status → no advancement, no terminal completion, no `hydrate_annual_review_system_scores`, no `finalized_at`.

That is exactly the symptom: response looks submitted, but the instance stays at "Management Review Pending" everywhere.

### Root cause — question 3 (no other options for Management)
`TeamReviewDetailContent` renders a single "Submit & forward" button for all reviewer stages. For a terminal role like `management` it should:
- read as a terminal CTA ("Finalise & Complete review"), not "forward",
- expose the same review notes textarea already used by other stages (Management stage in the UI currently has no remarks field wired in),
- expose "Send back" to the previous effective stage (Self) with a reason — parity with HR/BU terminal.

## Fix Plan

### 1. Data rollback for Jaspal (surgical, one instance)
Migration that:
- Unlocks and clears the management submission on `01f168dd-4f07-44ea-b8bf-9fb20452a497`:
  `UPDATE annual_review_responses SET is_locked = false, submitted_at = NULL, weighted_score = NULL WHERE instance_id = '01f168dd…' AND reviewer_role = 'management';`
- Leaves `overall_status = 'pending_management'` (already correct).
- Writes an `annual_review.stage_rollback` row to `system_audit_logs` with reason "user-requested test rollback".

Rationale: the response was locked but the instance never advanced, so this is enough to let Gaurav/Dummy edit + resubmit cleanly. No cascade needed.

### 2. Patch `annual_review_next_status` (SSOT fix, benefits every future Management submit)
Migration `CREATE OR REPLACE FUNCTION` that:
- Adds `('management',7)` to the seniority VALUES.
- Adds `WHEN 'pending_management' THEN 'management'` to the current-status CASE.
- Adds `WHEN 'management' THEN 'pending_management'` to the next-status CASE.
Behaviour becomes: for a chain `[self, management]`, `next_status('pending_management') → 'completed'`; for `[…, hr, management]` any HR submit routes to `pending_management`; for management submit routes to `completed`. This aligns SQL with the TS SSOT already fixed in `effectiveChain.ts` (SENIORITY/FORWARD).

Verification queries after migration:
- `annual_review_next_status('["self","management"]'::jsonb, 'pending_management')` → `completed`
- `annual_review_next_status('["self","manager","hr","management"]'::jsonb, 'pending_hr')` → `pending_management`
- Existing 6-stage chains unchanged (regression-safe: additive only).

### 3. UI — Management terminal actions in `TeamReviewDetailContent.tsx`
Presentation-only, no business-logic changes:
- Relabel primary CTA when the current stage is the last effective stage: "Finalise & Complete review" (keep "Submit & forward" for non-terminal stages). Uses `computeVisibleStages(instance, profiles)` (already imported) to detect terminal.
- Ensure the existing reviewer-notes textarea is rendered for `management` the same way it renders for `hr` / `bu_head` (currently the render guard omits `management`). Notes persist to `annual_review_responses.notes` through the existing upsert path — no schema change.
- Ensure "Send back" button is available on the Management stage (goes back to Self per the effective chain) with the same reason dialog used at HR/BU. `send_back_annual_review_status` already handles `management` because it uses `annual_review_effective_chain` for the prev-stage lookup — no RPC change needed.

### 4. Tests
- SQL regression: add `src/test/annualReview/effectiveChainManagement.test.ts` sibling — a small vitest that exercises `annual_review_next_status` through a Supabase RPC mock and asserts the three cases above (or a pure SQL check in a migration test if the harness supports it).
- UI: extend `src/test/annualReview/stageTrackerReviewerNames.test.tsx` with a management-terminal fixture — asserts the CTA label switches to "Finalise & Complete review" and the notes textarea + "Send back" button render for `reviewer_role === 'management'`.

## Risk & Impact

- **Data:** 1 row updated (management response for Jaspal). Instance `overall_status` unchanged.
- **Workflow:** `annual_review_next_status` change is additive — it only introduces a new mapping and a new seniority slot. Existing chains that don't contain `management` behave identically. Every Management submit that failed silently on the same code path is now resolvable by re-clicking Submit (only Jaspal is affected today; his response is unlocked in step 1).
- **UI:** Management reviewers see a terminal CTA + notes + send-back parity. No other stage's rendering changes.
- **Regression:** Low. Additive DB change, presentation-only UI change, single-row data patch.
- **Rollback:** Revert the two migrations and the TSX diff. The data patch is idempotent to re-apply.

## Verification checklist

1. `SELECT annual_review_next_status('["self","management"]'::jsonb, 'pending_management');` → `completed`.
2. Jaspal's `annual_review_responses` management row: `is_locked=false`, `submitted_at=null`.
3. As Dummy (001): open Jaspal's review, notes field visible, "Send back" available, primary CTA reads "Finalise & Complete review".
4. Click Finalise → toast success → instance `overall_status = 'completed'`, `finalized_at` set, `criteria_weighted_score` hydrated, response `is_locked=true`.
5. Existing HR-terminal instances (any completed 6-stage review) unaffected.
