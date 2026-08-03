# RCA — 100652 (Ajay Bedia): BU Head stage locked with an unscored criterion

## What the data shows (verified)

- Instance `7a263972…`, template `2f45f8fd…`, status **completed**, total 68.00, rating **Average**.
- Locked stage responses:
  - `self` — 9 criteria scored, weighted 210.00
  - `dept_head` — 9 criteria scored, weighted 210.00
  - `bu_head` — **8 criteria scored, `attendance` missing**, weighted **185.00**
- The template declares `attendance` (weight 5) with `reviewer_stages = [self, dept_head, bu_head]`, so BU Head was required to score it. Self and Dept both scored it 5 before BU submitted (26 Jul), so the criterion existed at that time.
- Net effect: the BU stage locked with a partial score set, 25 points lower than the identical self/dept sets purely because one criterion is absent.

## Why it was not flagged — the guard is all-or-nothing

`tg_ar_stage_score_required` (ADR-172) does:

```text
v_scored := count(keys in criteria_scores)
IF v_scored > 0 THEN RETURN NEW;   -- passes with ANY single score
```

It only blocks a **completely empty** response. One scored criterion is enough to pass. The client mirror (`missingStageCriteria` / `stageScoreGuardMessage`) is strict per-criterion, but it is UI-only — any write path that skips it (assisted/proxy submission, bulk paths, admin tooling) lands on the permissive DB guard.

## 5 Why

1. Why is BU "–" for Attendance? The `bu_head` response has no `attendance` key.
2. Why did it lock without it? The DB guard accepts any non-empty `criteria_scores`.
3. Why is the DB guard weaker than the client? ADR-172 targeted the *empty response → 0.0 rating* bug; partial scoring was never in scope.
4. Why did nobody notice afterwards? A missing criterion renders as "–", indistinguishable from "not applicable", and no completeness monitor exists.
5. Why did the score silently drop? The stage weighted score sums only the criteria present, so a missing criterion acts as a silent deduction instead of an error.

## Blast radius (queried, not estimated)

- **111 locked responses across 109 instances** have at least one criterion required by their template but absent from `criteria_scores`.
  - criterion-level counts: dept_head 83, bu_head 66, self 16
  - 108 of those instances are **completed**, 1 excluded
  - submissions span 05 Jul – 27 Jul 2026; up to 11 missing criteria on a single response

## CAPA

**Corrective (data)**
1. Add an admin **Stage Completeness** diagnostic RPC listing every locked response with missing required criteria (instance, employee, stage, missing criterion names, points at risk).
2. Repair per row with explicit admin action and audit rows — no silent auto-fill of scores no human gave. Two options: (a) send the stage back to the reviewer to score the missing criterion, (b) admin-records the score with a reason. Recompute finals **only** through `annual_review_apply_final_summary` (POLICY §AR-FINAL-SCORE-SINGLE-WRITER).

**Preventive (code)**
3. Harden `tg_ar_stage_score_required` from "any score" to "**every** criterion visible to this stage" (per-criterion key check against the effective template), keeping the `annual_review.bypass_stage_score_guard` escape hatch for repair tooling.
4. Add an admin monitoring card (same shape as `FinalScoreDriftCard`) surfacing the completeness-gap count so this class of defect is never silent again.
5. Regression tests: partial submission rejected server-side; complete submission accepted; narrative-only stage still exempt; bypass flag honoured.

**Governance**
6. ADR-242 + POLICY §AR-STAGE-SCORE-COMPLETE superseding the all-or-nothing reading of §AR-STAGE-SCORE-REQUIRED; DOCUMENTATION.md version history updated in the same change.

## Risk & impact

- **Data:** repair touches locked historical responses and recomputes finals for up to 108 completed reviews — every write audited; rollback via retained pre-change archive rows.
- **Workflow:** the stricter guard can block reviewers who leave a criterion blank; the error names the exact missing criteria.
- **UI:** new admin diagnostic card only; no reviewer-facing layout change.
- **Regression risk:** medium — the guard sits on every stage submission. Mitigated by bypass flag, tests, and staged rollout (diagnostic first, guard second).

## Sequence

1. Diagnostic RPC + admin card (read-only) → review the 109-instance list.
2. Harden the trigger + tests.
3. Repair flagged rows (send-back or admin-record), recompute via the sanctioned writer.
4. ADR-242, POLICY, DOCUMENTATION.