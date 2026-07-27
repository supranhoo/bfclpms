## Assumptions

- Both employees should carry the same "Annual Production Target Vs Actual" outcome as their template peers (all 37 scored rows carry **15 points of the 25 weight**). If their plant/line figure differs, tell me the correct raw value and the plan uses that instead.
- No re-scoring of any other criterion is intended.

## What the data actually shows (verified)

Effective template for **both** is `DRI/Admin - W - Pollution` (`408ae1b3…`; 100508 reaches it via `template_override_id`). That template has 7 system slots, including `sys_3jsce5p` — **Annual Production Target Vs Actual, weight 25**.

| | 100508 Satyam Kumar Jha | 101676 Satyaban Roy |
|---|---|---|
| Status | completed (finalised 27-Jul, ADR-185) | completed (finalised 27-Jul, ADR-185) |
| System slots stored | 6 of 7 | 6 of 7 |
| `sys_3jsce5p` (Annual Production) | **absent** | **absent** |
| Criteria weighted | 195.00 | 231.00 |
| Total / rating | 51.00 Poor | 58.20 Average |

Every other non-excluded instance on this template has `sys_3jsce5p = 15`, all written in one burst on **25-Jul 16:08–16:09**. The only rows without it are these two plus the two `excluded` instances (101375, 101376).

## Root cause — 5 Why

1. **Why is the score missing?** The 25-Jul bulk system-scores upload never wrote `sys_3jsce5p` for these two instances.
2. **Why not?** The uploader classified them as `verdict: 'skip', reason: "Locked stage: …"`.
3. **Why skipped?** `src/services/annualReview/cycleBulkDataUpload.ts:462-476` allows a write only when the status is in `STAGE_SAFE = {not_started, pending_self, pending_manager}`, or when it is exactly `completed` **and** the admin ticked "apply to completed reviews" (ADR-171 upgrade path).
4. **Why did that exclude them?** At 25-Jul 16:08 these two were mid-workflow after the ADR-185 re-open: 101676 was `pending_bu`, 100508 was `pending_dept`. Neither is in `STAGE_SAFE`, and neither was `completed` — a **coverage gap** covering `pending_dept`, `pending_bu`, `pending_skip`, `pending_hr`, `pending_management`. Their 37 peers were all `completed`, so the upgrade path caught them.
5. **Why did nobody notice?** The skip is reported only as an aggregate "N skip" badge with a status reason; nothing flags "a system slot the template requires has no value at finalisation".

Compounding effect: `annual_review_compute_final_summary` builds the system denominator from **template weights**, not from stored keys — so the missing slot counts as **0 out of 25**, not as excluded. The ADR-185 finalisation on 27-Jul therefore locked in totals depressed by up to 15 points each. This is a real scoring defect, not just a display gap.

## Risk & Impact Report

- **Data impact:** Writes one system-score key on 2 instances and recomputes `total_score` / `final_rating`. Ratings will change (both rise). No schema change; additive plus a dated audit snapshot.
- **Workflow impact:** None — both stay `completed`; no stage moves, no reviewer queues touched.
- **UI/UX impact:** Score card, admin grid, and the Annual Review report show the new total and rating; a new skip-reason surface in the bulk-upload dialog (below).
- **Regression risk:** Low for the repair (explicit 2-instance whitelist, monotonic upgrade only). Moderate for widening `STAGE_SAFE` — that is why the uploader change is a *reported gap*, not a silent widening.
- **Scalability:** Two rows; detector query is a single indexed scan over the cycle.
- **Mitigation:** Reuse `admin_apply_system_scores_upgrade` (monotonic, already audited) plus `annual_review_compute_final_summary` — no hand-computed totals. Full before-state snapshot for one-statement rollback.

## Plan

1. **Confirm the source figure.** Re-read the 25-Jul upload workbook value for this template group (peers = 15/25) and confirm it applies to both employees. *Verify: value agreed before any write.*
2. **Pre-snapshot.** New audit table `annual_review_missing_system_slot_repair_2026_07`: instance_id, employee_code, prior `system_scores`, `system_scores_raw`, `total_score`, `final_rating`, slot key, applied points, reason, `performed_by = NULL` (system-applied). *Verify: 2 rows.*
3. **Apply the missing slot** via `admin_apply_system_scores_upgrade` for each instance — monotonic, so it can only add, never downgrade. *Verify: both instances now hold 7/7 slots.*
4. **Recompute aggregates** with `annual_review_compute_final_summary` and write `total_score` / `final_rating`, exactly as the normal path does. *Verify: new totals ≈ 51.00 → ~66 and 58.20 → ~73; ratings re-derived, not hand-set.*
5. **System-wide detector (the real CAPA).** Query every instance in the cycle for template system slots with **no stored value**, and report count by status. Repair anything else the same way only after review — no blind sweep. *Verify: list produced; scope of the gap known beyond these two.*
6. **Close the uploader gap.** In `cycleBulkDataUpload.ts`, treat mid-workflow statuses as an explicit, visible outcome: keep them skipped by default but change the reason to `"Mid-workflow stage: pending_bu — not covered by safe or completed-upgrade mode"`, and surface a per-status breakdown in the dialog's skip badge so a whole cohort can never be silently missed again. Add a "Mid-workflow rows (upgrades only)" admin opt-in routed through the same monotonic RPC.
7. **Guard at finalisation.** Extend the ADR-172 stage-score guard family with a warning-level check: finalising an instance whose effective template has a weighted system slot with no stored value logs to the audit trail and shows an admin warning (not a hard block — some slots legitimately land late).
8. **Tests.** `src/test/annualReview/missingSystemSlot.test.ts` — (a) a mid-workflow status is reported as an explicit skip with a status-specific reason, not folded into "Locked stage"; (b) a template slot with no stored value scores 0/weight in the total, proving the depression is real; (c) the repair is monotonic and cannot lower a stored value.
9. **Docs, policy, memory.** `docs/adr/ADR-186.md`, POLICY **§AR-SYSTEM-SLOT-COVERAGE** ("a weighted system slot with no stored value scores zero — bulk uploads must never silently skip a cohort by status"), `DOCUMENTATION.md` version bump, and a memory entry.

## UI Changes

- **Bulk Data Upload dialog** — the existing `N skip` badge becomes a hoverable breakdown listing skip reasons by status (e.g. `12 completed · 2 pending_bu · 1 pending_dept`), plus a new "Mid-workflow rows (upgrades only)" checkbox next to the existing completed-rows checkbox. Same card, no layout shift, wraps on mobile.
- **Admin review detail** — a warning chip "System slot missing: Annual Production Target Vs Actual (0/25)" on any instance with an unfilled weighted slot. Inline in the score breakdown card; no new route or dialog.

## Rollback

`annual_review_missing_system_slot_repair_2026_07` stores prior `system_scores`, `system_scores_raw`, `total_score` and `final_rating`; one update restores both instances exactly.
