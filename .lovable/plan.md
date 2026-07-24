## Root cause of the "instance … not found" toast (verified)

`annual_review_instances` RLS was updated for every reviewer slot **except** the new Management stage:

| Policy | Current predicate | Gap |
|---|---|---|
| `instances_select_visible` (SELECT) | `employee_id / manager_id / skip_id / dept_head_id / bu_head_id / hr_id = auth.uid()` + admin/HR-PMS | **`management_id` missing** |
| `instances_stage_update` (UPDATE) | Per-stage `(*_id = auth.uid() AND status = 'pending_*')` for the other five roles | **No `(management_id = auth.uid() AND status = 'pending_management')` branch** |

Consequence for Gaurav / Dummy on `01f168dd-…`:
- Team queue lists it (queue RPC is SECURITY DEFINER — bypasses RLS).
- Detail page opens because a *different* policy — `instances_select_directory_assistance` — happens to grant access via the assistance helper.
- The moment they click **Save draft** / **Send back** / **Approve**, the RPCs run as `SECURITY INVOKER`, do `SELECT … INTO v_inst FROM annual_review_instances WHERE id = p_instance_id` — the row is invisible to RLS → `RAISE EXCEPTION 'instance % not found'`.

`annual_review_responses` RLS already covers `i.management_id = auth.uid()`, so read/write of the response row itself is fine — only the instance-level policies need patching.

Also missing / worth strengthening for a true "Final Stage owned by Management":
1. Instance UPDATE gate for `pending_management` stage (blocks save/advance/send-back at RLS layer today).
2. Reviewer-visibility SSOT test (`stageForReviewer.test.ts`) enumerates only the five legacy slots — a contract test drift that lets this exact regression re-happen. Extend to include `management_id`.
3. UI polish for the terminal stage so the reviewer feels the weight of the decision (label, confirmation, remarks, finalization CTA, employee-visible acknowledgment of Management sign-off).
4. Guardrail tile on Access Control tab: "BU-Head instances missing Management routing" — count of BU Heads whose reporting manager holds `management` but whose instance lacks `management_id` / `'management'` in `enabled_stages`. Surfaces future drift instantly.

---

## Plan

### Step 1 — RLS fix (migration, additive only, no data changes)
`ALTER POLICY instances_select_visible` and `ALTER POLICY instances_stage_update` on `annual_review_instances` to add the Management branches:

```text
SELECT USING: … OR management_id = auth.uid()
UPDATE USING: … OR (management_id = auth.uid() AND overall_status = 'pending_management')
```

Rollback: revert the two `ALTER POLICY` statements — no schema or data change.

### Step 2 — SSOT contract test extension
`src/lib/annualReview/stageForReviewer.test.ts` — add `management_id` to `REVIEWER_ID_SLOTS`. The test walks `annualReviewService.ts` and the RLS migration to assert both surfaces mention the slot. This makes any future stage addition fail CI unless the RLS migration is present.

Also add a case in `stageForReviewer` tests: `pending_management + uid=management_id → 'management'` (function already handles it; the assertion locks it in).

### Step 3 — Management-stage terminal UX in `TeamReviewDetailContent.tsx`
Frontend-only, presentation:

- **Header chip:** show "Management Review — Final Stage" with a distinct emerald tone (reuse existing `stagePresentation` map) and a subtitle *"Your approval finalises this review."*
- **Action bar:** rename the primary CTA to **"Finalise & Approve"** when `role === 'management'`; keep **Send back** and **Save draft** unchanged.
- **Confirmation dialog** before Finalise: shows employee name, total score, final rating, and a required *Management remarks* textarea (persists to `notes` on the management response). Copy: *"Once finalised, the review is locked and shared with the employee. This action is audit-logged."*
- **Post-finalisation banner** on the employee's completed view: "Reviewed and approved by Management — {name}, {date}." Read from the locked `management` response row (no schema change).
- Empty-state copy tweak on employee page while `pending_management`: "Your review is with Management for final approval."

### Step 4 — Guardrail tile on `AccessControlTab.tsx`
Read-only counter (no writes): "BU-Head instances missing Management routing" using a new SECURITY DEFINER view or inline RPC that counts rows where the employee's `reporting_manager` has the `management` role AND (`management_id IS NULL` OR `NOT (enabled_stages ? 'management')`). Clicking opens a drawer listing affected employee codes so admins can run the existing "Backfill all Management users" button.

### Step 5 — Verification
1. Sign in as Gaurav (Management) → open Jaspal's instance → **Save draft** succeeds (no toast).
2. Click **Finalise & Approve** → confirmation dialog → status moves to `completed`, response `is_locked = true`, `finalized_by / finalized_at` stamped.
3. Sign in as Jaspal → completed view shows the Management acknowledgment banner.
4. Contract test `stageForReviewer.test.ts` passes with the new `management_id` assertion.
5. Guardrail tile shows `0` after Step 1's RLS fix (data already backfilled).

---

## Risk & Impact

- **Data impact:** None. Migration only widens two `USING` clauses; no rows are touched.
- **Workflow impact:** Management users regain full save/send-back/approve capability that ADR-148/149 intended. No other role's permissions change.
- **UI/UX impact:** Terminal stage gets a distinct, confidence-inspiring finalisation flow (confirmation + remarks + audit line). No layout regression for the other five reviewer roles — all new copy is gated on `role === 'management'`.
- **Regression risk:** Low. Additive OR-branches to policies; existing predicates unchanged. Contract test locks the SSOT so a future 8th stage can't re-open this hole.
- **Scalability:** No change — same predicate shape as the other five reviewer slots.
- **Rollback:** Two `ALTER POLICY` statements to previous predicates; UI changes are behind role check.

---

## Open question before I build

The screenshot toast fires on **Save draft**. Save draft goes through the `annual_review_responses` table directly (RLS on that table already allows Management), so the "instance not found" wording must be coming from a wrapper RPC or a pre-check I haven't opened yet. Before writing the migration I will grep the exact string `instance % not found` across all `advance_/send_back_/finalize_/upsert_*` RPCs and confirm which one is the emitter — the fix (RLS widening) is the same either way, but I want to attach the correct RPC name to the ADR.

Shall I proceed with Steps 1-5 as above, or do you want to expand Step 3 (Management UX) into a broader brainstorm — e.g. calibration view side-by-side with peer BU-Head scores, one-click "Approve all pending Management" batch, mandatory rating band justification when Final Rating < 3 or = 5?