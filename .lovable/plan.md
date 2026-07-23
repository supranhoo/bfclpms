
# Fix: System-Score-Only Templates Finalize at 0.00

## Problem (Verified)

Instances on templates whose weight is 100% system-driven (Carry-KRA, uploaded system scores) can finalize with:
- `criteria_weighted_score = 0.00`
- `total_score = 0.00`
- `final_rating = "Poor"`

Verified case: Ankit Choudhary (101785, instance `0eef09b7…`) — status `completed`, but `system_scores = {}` on the instance row despite Carry-KRA being the template's only scoring source.

## Root Cause (5 Whys)

1. Why is the final score 0? Because `annual_review_compute_final_summary` returns `total_score = 0` when both `criteria_weighted_score` is NULL and `v_sys_total = 0`.
2. Why is `v_sys_total = 0`? Because the SQL function reads `annual_review_instances.system_scores` (persisted JSONB) — which is `{}` for this instance.
3. Why is the persisted `system_scores` empty? Because it is populated only when: (a) HR uploads via `SystemScoresUploadDialog`, or (b) `useUpdateSystemScores` is called from the client, or (c) a reviewer opens the review page (client hook `useResolvedSystemScores` resolves Carry-KRA at render time).
4. Why did none of those run? Because a reviewer submitted through a code path (proxy / assistance / direct RPC) that never triggered the client-side hydration, and the terminal `advance_annual_review_status` did not hydrate on the server.
5. Why does the server not hydrate? Because Carry-KRA snapshotting has always lived in TypeScript (`carryKraScore.ts`). The database has no equivalent, so any submission that bypasses the client hook finalizes with empty system_scores.

**Category, not instance:** every 100%-system template (Carry-KRA or uploaded) is at risk on every submission path that skips the client hook — proxy, assisted, admin advance, backfill, retries. Ankit is one of an unknown number.

## Fix Strategy — SSOT on the Server (ADR-140)

Move Carry-KRA hydration into the database and make it a hard precondition of completion. Client hook stays as a UX preview but is no longer the source of truth.

### 1. New SQL helper: `hydrate_annual_review_system_scores(p_instance_id uuid)`
- Reads `template.sections.system_scores`.
- For each slot with `source = 'carry_kra'`, computes the normalized score from `public.kpis` for the employee within the cycle window using the existing `carry_config` (same rules as TS `carryKraScore.ts`: N/A exclusion, weightage, partial-period, penalty).
- For `source = 'manual'` / uploaded — leaves existing values untouched.
- Writes the merged map to `annual_review_instances.system_scores` (and `system_scores_raw` where applicable).
- Idempotent; returns the resulting JSONB.

### 2. Hard-wire into `advance_annual_review_status`
- Before recomputing the final summary at the terminal stage, call `hydrate_annual_review_system_scores(p_instance_id)`.
- If the template declares system slots and, post-hydration, any required slot is still missing/NULL, **raise** `ADR-140: system score hydration failed for slot X`. This blocks a 0-score completion instead of silently persisting it.

### 3. Update `annual_review_compute_final_summary`
- No formula change. Only tighten the terminal branch so `total_score` cannot be forced to 0 when the template's system-slot weight > 0 and hydration returned real values.
- Keep the "criteria-only + no scores" branch returning NULL (unchanged).

### 4. One-shot repair (audited)
- Find every completed instance where the resolved template has system-slot weight > 0 AND `instance.system_scores` is empty OR missing declared slots.
- For each, call `hydrate_annual_review_system_scores` then `annual_review_compute_final_summary`, and update the instance row.
- Write every change to `annual_review_final_backfill_audit_2026_07` with before/after values.
- Never overwrite a non-zero persisted score with a lower value without logging both.

### 5. Client cleanup (non-behavioral)
- `useResolvedSystemScores` stays for preview but reads only from the persisted `instance.system_scores` (already the case). Remove the dead expectation that the client must "save" to finalize.
- Add a small info notice on reviewer forms for 100%-system templates: "Final score is computed from monthly KRA achievements at submission."

### 6. Tests & mock data
- Unit test `hydrate_annual_review_system_scores` for: pure Carry-KRA template, mixed criteria+system, N/A exclusion, missing monthly rows (should raise), uploaded manual slots preserved.
- Regression test: proxy submission on a 100%-system template must produce non-zero `total_score`.
- Mock: an instance with `system_scores = {}` and 100% carry-KRA template — expect non-zero after advance.

## UI Changes

- Reviewer form (100%-system templates): add a one-line notice under the score section: "Final score is computed automatically from monthly KRA at submission." No layout changes.
- Admin analytics: unchanged; will simply stop showing 0.00 for these instances.

## Risk & Impact

- **Data:** Repair will re-score previously completed instances that had 0. Every change audited; monotonic guard (never lower a real score to 0).
- **Workflow:** Terminal submissions on system-only templates that truly have no monthly data will now **fail loudly** instead of silently completing at 0. This is desired — surfaces missing KRA data instead of demotivating employees.
- **UI:** Additive notice only.
- **Regression:** Criteria-only templates untouched (branch preserved). Mixed templates re-normalised through the same SSOT already in place (ADR-126).
- **Rollback:** Repair runs inside a transaction per batch; the trigger addition is a single `CREATE OR REPLACE` that can be reverted.

## Technical Section

- Migration `20260723_ADR140_system_score_hydration.sql`:
  - `CREATE OR REPLACE FUNCTION public.hydrate_annual_review_system_scores(uuid) RETURNS jsonb SECURITY DEFINER`
  - Alter `advance_annual_review_status` (`v_next = 'completed'` branch) to call hydrator + assert non-empty for declared system slots
  - Alter `annual_review_compute_final_summary` — no logic change, add comment referencing ADR-140
  - `GRANT EXECUTE ON FUNCTION ... TO authenticated, service_role`
- Migration `20260723_ADR140_repair.sql`:
  - Insert-into-audit + update loop scoped to `annual_review_final_backfill_audit_2026_07`
- TS: no service changes required; add notice component in `EmployeeAnnualReview.tsx` and `AssistedAnnualReview.tsx`.

## SSOT / Policy Updates

- **POLICY §AR-SYSTEM-SCORE-HYDRATION (ADR-140):** For any template with `system_scores` weight > 0, the database — not the client — is the source of truth. Completion is blocked until every declared system slot has a resolved numeric value. Carry-KRA slots are hydrated server-side at submission from `public.kpis` using the same rules as the TS SSOT.
- **DOCUMENTATION.md:** Add ADR-140 to Version History; update the Annual Review scoring diagram to show server-side hydration on the terminal advance path.

## Verification

1. Re-run compute on Ankit Choudhary (101785); expect non-zero `total_score` if monthly KRA exists, else a specific failure naming the missing slot.
2. Query for other affected instances (system-slot > 0, `system_scores = '{}'`, status `completed`) — expect 0 rows post-repair.
3. New proxy submission on a Carry-KRA template must finalize with the KRA-derived score, verified via `annual_review_terminal_auto_finalized` audit entry.

## Open Question (please confirm before I build)

Should the server treat a 100%-Carry-KRA slot with **no monthly KRA rows at all** for that employee as (a) hard failure that blocks completion, or (b) NULL total (unrated) so HR resolves manually? My recommendation is (a) — silence is what caused this bug in the first place.
