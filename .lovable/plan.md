## What happened (verified in the database)

Sunil Ram (101361) and Sumit Kumar (102011) both run the chain `Self → Dept Head → BU Head`.

1. Their Dept Head submitted a **narrative-only** response — `criteria_scores` empty.
2. The BU Head then scored and locked (101361 = 315 pts, 102011 = 265 pts); both instances reached **Completed** (66.00 "Average" / 53.00 "Poor").
3. On **2026-07-27 04:15:08** the ADR-172 empty-stage repair sweep unlocked those empty Dept Head responses and forced `overall_status = pending_dept`, nulling `total_score`, `criteria_weighted_score`, `final_rating`, `finalized_at` — **without checking that a downstream stage was already actioned**. Logged in `annual_review_empty_stage_repair_2026_07`.

That is why they read "pending Dept Head" while BU Head shows complete. It is the same defect class ADR-183 fixed in the supersede path, present here in the empty-stage path.

Blast radius: 30 rows touched by that sweep; 8 were previously Completed; **5 are still stuck** with a locked downstream response:

| Code | Name | Prev score / rating |
|---|---|---|
| 101029 | Bunty Kumar | 14.00 / Poor |
| 101230 | Jay Parakash Singh | 11.00 / Poor |
| 101323 | Ankush Kumar | 0.00 / Poor |
| 101361 | Sunil Ram | 66.00 / Average |
| 102011 | Sumit Kumar | 53.00 / Poor |

(101199, 101751, 101982 already returned to Completed.)

## Risk & impact

- **Data**: only the 5 listed instances plus their Dept Head response rows change. Before/after captured in a new dated audit table, so it is fully reversible.
- **Workflow**: reviews leave the Dept Head queue; no reviewer loses submitted work — the narrative Dept Head text stays.
- **UI/UX**: none — same components, corrected data.
- **Regression risk**: the guard change must not weaken ADR-172 (empty locked stage on a *live* chain must still be reopened). Mitigated by scoping the new exemption strictly to "a later enabled stage already has a locked response".
- **Scalability**: touched-row counts are tiny; the guard adds one EXISTS per evaluated instance.
- **Rollback**: restore rows from the audit table; revert the function/trigger to the current body.

## Plan

1. **Guard fix (ADR-184 / POLICY §AR-REPAIR-NO-DOWNSTREAM-REWIND)** — in the empty-stage repair/guard path (`trg_ar_stage_score_required` and the repair routine), skip any instance where a **later enabled stage already holds a locked response**. In that case the empty upstream response is left locked and the instance keeps its terminal status; a diagnostic row is recorded instead of a rewind.
2. **Terminal recompute** — where all enabled stages are actioned, resolve status to `completed` and recompute aggregates via `annual_review_compute_final_summary`, never null them (mirrors ADR-183 rule 2).
3. **Repair the 5 rows** — re-lock the Dept Head narrative responses, set `overall_status = completed`, recompute score/rating from the locked BU Head submission, restore `finalized_at`/`finalized_by`; log before/after into `annual_review_downstream_rewind_repair_2026_07`.
4. **Verification query** — confirm zero instances remain in a `pending_*` status while a later enabled stage has a locked response.
5. **Tests** — `src/test/annualReview/noDownstreamRewind.test.ts`: empty upstream + locked downstream → no rewind, promotes to completed with recomputed aggregates; empty upstream with **no** downstream action → still rewinds (ADR-172 preserved).
6. **Docs** — `docs/adr/ADR-184.md`, POLICY §AR-REPAIR-NO-DOWNSTREAM-REWIND, DOCUMENTATION.md version history, and memory `mem/features/annual-review/no-downstream-rewind.md`.

## UI changes

None.

## Technical notes

Reused invariant across all three rewind paths (supersede, stage-revert, empty-stage repair): *never set an instance to a `pending_*` stage that precedes an already-locked response; if nothing unactioned remains, the instance is terminal and aggregates are recomputed, not erased.* Canonical order stays `self → manager → skip_manager → dept_head → bu_head → hr → management`.
