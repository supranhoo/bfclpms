
# Fix — Completed reviews missing criteria_weighted_score / total_score / final_rating

## 1. Assumptions
- Employee **200141 (Mithu Kumar Mahto)** was surfaced as the reproducer. His instance `3ddaabb9…` shows `overall_status='completed'`, `finalized_at=2026-07-19`, all three reviewer responses locked (self / dept_head / bu_head, weighted 225/220/220), **but** the instance columns `criteria_weighted_score`, `total_score`, `final_rating` are NULL — which is why the employee page shows Criteria 0/45 and no rating.
- His workflow terminates at BU Head (no HR stage). This is the intended terminal per POLICY §AR-BU-HEAD-TERMINAL (ADR-109).

## 2. Verified current state (data reads, not assumption)
- `SELECT COUNT(*) FROM annual_review_instances WHERE overall_status='completed' AND (criteria_weighted_score IS NULL OR total_score IS NULL OR final_rating IS NULL)` → **760 / 760**. 100% of completed instances are affected — this is not a per-employee anomaly.
- `pg_get_functiondef('advance_annual_review_status')` confirms the completion branch only sets `finalized_at`/`finalized_by`; it never computes or writes `criteria_weighted_score`, `total_score`, or `final_rating`. Those columns are only written by `finalizeInstance()` (HR route) in `annualReviewService.ts`.
- Result: workflows that legitimately end at BU Head / Dept Head / Skip / Manager silently complete without persisting the final numbers the employee UI (`EmployeeResultsView.tsx`) and reports rely on.

## 3. Root Cause (5-Why)
1. Employee sees Criteria 0/45 and no /5 rating → because `instance.criteria_weighted_score` and `instance.final_rating` are NULL.
2. Why NULL? → No routine wrote them on this instance.
3. Why not written? → `advance_annual_review_status` never populates them; only HR's `finalizeInstance` does.
4. Why is HR the only writer? → Legacy assumption that every workflow ends at `pending_hr`; BU-Head-terminal workflows (ADR-109) weren't retrofitted onto the finalization path.
5. Why did this survive to prod? → No trigger/test asserting "when `overall_status='completed'` then all three final columns must be non-NULL".

## 4. Risk & Impact
| Area | Impact |
|---|---|
| Data | 760 completed instances get final columns backfilled from locked responses + system_scores. Additive UPDATE only; audit-logged. No historical value is destroyed. |
| Workflow | Terminal advancement now writes final numbers. HR-terminated flows still go through `finalizeInstance` unchanged (HR-typed rating wins). |
| UI/UX | Employee's "Your Final Review" card, admin exports, and comprehensive report will show real numbers instead of `—`. |
| Regression | Low — the change is scoped to the `v_next = 'completed'` branch of one RPC + a one-shot backfill. Existing HR-path finalization is untouched. |
| Scalability | 760 row backfill is trivial; ongoing writes are O(1) per submit. |
| Rollback | Migration is additive; a rollback script would NULL back the backfilled columns from `annual_review_final_backfill_audit_2026_07`. |

## 5. Plan (Step → Verification)

### Step 1 — Add PL/pgSQL SSOT `public.annual_review_compute_final_score(instance_id)`
Mirrors `computeFinalScore` in `src/lib/annualReview/finalScore.ts`:
- Resolves effective stage weights (`stage_weights_override` → template `stage_weights_v2`/`stage_weights` → legacy `{criteria:100}`).
- Reads locked reviewer `weighted_score`s from `annual_review_responses`.
- Sums `system_scores` (already in /100 points) for the system bucket.
- Uses instance `criteria_weighted_score` (when present) for the legacy `criteria` bucket, else the **terminal reviewer's weighted_score** normalised via effective template's criteria max.
- Returns `(criteria_weighted_score, total_score numeric(0..100), final_rating text band)`.

Rating band derivation is master-data driven — read from `annual_review_settings` if a rating scale exists, else standard band: `≥90 O, ≥80 E, ≥70 M, ≥60 P, else U` (same bands used elsewhere; will confirm at build time by reading `annual_review_settings`).

**Verify:** New unit tests in `supabase/functions/*` mirror sample from 200141 and assert `total_score ≈ 60.2`, `final_rating='M'`.

### Step 2 — Patch `advance_annual_review_status`
When `v_next = 'completed'` and `criteria_weighted_score IS NULL` (i.e., not already set by HR path), call the SSOT and UPDATE the three columns in the same statement that sets `finalized_at`. HR path (`finalizeInstance`) is unchanged — HR still wins on the columns it writes.

**Verify:** Manual test on a scratch instance advancing through terminal BU Head → three columns are non-NULL.

### Step 3 — One-shot backfill of the 760 existing completed instances
- Snapshot to new `annual_review_final_backfill_audit_2026_07` table (id, instance_id, old/new values, at).
- Run the new SSOT for each `overall_status='completed' AND criteria_weighted_score IS NULL` row.
- Log a single `system_audit_logs` entry with counts.

**Verify:** Re-run the diagnostic query; expect 0/760 remaining. Spot-check 200141 shows populated columns.

### Step 4 — Add DB invariant + regression tests
- New CHECK-style validation via trigger: block `overall_status → 'completed'` transitions where the three columns end up NULL (defense in depth).
- Tests:
  - `src/tests/annualReviewFinalScorePersistence.test.ts` — TS SSOT parity harness on Mithu's shape.
  - `supabase/functions/*/annual_review_terminal_completion_test.ts` — Deno test asserting the RPC persists all three columns.

### Step 5 — SSOT docs
- `DOCUMENTATION.md`: v2.66.119 entry describing ADR-124 (Terminal Completion Persistence).
- `POLICY.md` §AR-TERMINAL-COMPLETION-PERSISTENCE: "Every `overall_status='completed'` instance MUST have `criteria_weighted_score`, `total_score`, and `final_rating` persisted. Whichever routine performs the terminal transition (HR path or `advance_annual_review_status`) is responsible for writing them."
- `mem/features/annual-review/terminal-completion-persistence.md` + index entry.

## 6. UI Changes
Not Applicable — no rendering code changes. `EmployeeResultsView.tsx` already reads the three columns; once they are populated by the backfill, the employee's Total Score, Criteria weighted, `≈ x.x / 5` and Final Rating badge appear automatically.

## 7. Zero-Hardcoding & Multi-tenancy
- Rating band thresholds sourced from `annual_review_settings` (fallback constants only when no config row exists — same policy the HR UI already applies).
- No employee/department names hardcoded; backfill is set-based.

## 8. Rollback
Provide `docs/adr/ADR-124-rollback.sql` that: (a) restores the three columns from the audit snapshot, (b) drops the invariant trigger, (c) reverts `advance_annual_review_status` to the previous body preserved as `advance_annual_review_status_pre_adr124`.

## 9. Out of Scope (call-outs, no code)
- The separate scale mismatch between raw `weighted_score` (e.g. 220 for max 250) and the /100 scale assumed by `computeFinalScore` exists in TS too. This plan normalises consistently inside the SSOT (dividing by `criteria_raw_max` and scaling to `100 − systemMax`) but does NOT refactor the TS reader — happy to open a follow-up if you want the running-score projections aligned.

---

**One approval → I ship Steps 1–5 in a single migration + companion TS test + doc updates, and run the 760-row backfill.**
