# Admin Final Outcome panel on the Annual Review detail page (ADR-238)

## Assumptions

- "Here" = the annual review detail page shown in your screenshot (`TeamReviewDetailContent`), the same
  place that already has Update system scores / Calibrate final rating / Fill eligibility inputs.
- Admin (and HR PMS) should see, in one card: the final score, the exemption position, and every change
  made to that employee's review — without leaving the page.
- Read-only surface. No new write paths, no change to how scores are computed.

## What the admin will see

A new card, **Final Outcome (Admin)**, placed directly under the System Scores card and the action
buttons, visible only to admin / hr_pms. Three parts:

1. **Score strip** — Final score `/100`, Computed rating `/5`, Calibrated rating `/5` (badge "Calibrated"
   with reason, who, when), Effective rating `/5`, Increment slab `%`. Values come from the existing
   SSOT helpers (`effectiveRating`, `effectiveSlabPercent`, `ratingSlab`) — nothing recomputed locally.
2. **Eligibility & exemption strip** — effective status chip (Eligible / Exempted / Ineligible /
   Not assessed) from `effectiveEligibility.ts`, the waived criterion, exemption reason, approver name,
   approval date, whether it came from a bulk run, and the step-down penalty applied to the slab.
   If no exemption exists, one quiet line: "No exemption recorded".
3. **Change log** — a compact, newest-first timeline for THIS instance only: calibration set/cleared,
   final-score recomputes (old → new), system-score corrections/upgrades, exemption requested/approved/
   revoked, stage/status transitions and reviewer remaps. Each row: timestamp, what changed,
   old → new, who did it, reason. Collapsed to the latest 5 with "Show all" expanding to a scrollable
   list (server-paginated, 50 per page — no unbounded fetch).

Empty, loading and error states are explicit: skeleton rows while loading, a muted "No changes recorded"
line when empty, and an inline retry on failure (no silent blank card).

## Technical design

**Server (single migration, additive only)**

- New SECURITY DEFINER RPC `public.annual_review_instance_change_log(p_instance_id uuid, p_limit int,
  p_offset int)` returning `(occurred_at, event_type, field_label, old_value, new_value, actor_id,
  actor_name, reason, total_count)`.
  It UNIONs, for that one instance: `annual_review_calibration_audit`,
  `annual_review_final_score_recompute_audit`, the system-score audit rows already written by
  `admin_apply_system_scores_upgrade` / `_correction`, `annual_review_eligibility_exemptions`
  (request/decision/revoke, incl. `bulk_run_id`), and the annual-review slice of the existing change
  history source used by the Master Change History report (ADR-213) so the two reports cannot drift.
- **RLS:** the RPC's first statement is a guard —
  `IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'hr_pms')) THEN RAISE EXCEPTION` —
  so the definer rights can never widen access. `GRANT EXECUTE ... TO authenticated` only; no `anon`.
  Ordered by `occurred_at DESC`, `LIMIT/OFFSET` enforced server-side, `total_count` via window function.
- No table is created, so no new GRANT/policy work; the underlying audit tables keep their current RLS
  and are only reached through the guarded function.

**Client**

- `src/hooks/useAnnualReviewInstanceChangeLog.ts` — paginated TanStack query over the RPC,
  `enabled` only when the viewer is admin/hr_pms, 60s staleTime.
- `src/lib/annualReview/instanceChangeLog.ts` — pure label/format helpers (event → human label,
  old → new rendering, actor fallback to "System" when `actor_id` is null, per project convention).
- `src/components/annual-review/AdminFinalOutcomeCard.tsx` — presentation only; consumes the hook plus
  existing `effectiveRating` / `effectiveEligibility` helpers. No business logic in the component.
- `TeamReviewDetailContent.tsx` — render the card behind the existing `effectiveRole === 'admin'`
  gate widened to include `hr_pms`. This is the only edit to the page.

**UI treatment**

Semantic tokens only (no hardcoded colours), card with a three-column responsive score strip that
stacks on mobile, badges for Calibrated / Exempted / Ineligible, monospaced numerics with the existing
two-decimal `fmt2()` for all `/5` values (POLICY §UI-SCORE-PRECISION), and the timeline as a bordered
list with a left rail — consistent with `InstanceTimeline`.

## Tests

- `instanceChangeLog.test.ts`: event labelling, null-actor → "System", old → new formatting, ordering.
- `AdminFinalOutcomeCard.test.tsx`: renders calibrated vs computed correctly; shows exemption details
  and penalty; shows "No exemption recorded" when absent; hides entirely for a non-admin role.
- Mock data covering: calibrated + exempted, ineligible with no exemption, clean completed review.

## Risk & impact

- **Data:** read-only. Additive migration (one function). No schema or policy change to existing tables.
- **Workflow:** none — no new writes, no stage effects.
- **UI/UX:** one new admin-only card; existing layout for all other roles unchanged.
- **Regression risk:** low, confined to one page and one new component.
- **Scalability:** server-side pagination and a hard limit; the log query is indexed on `instance_id`
  and runs for a single instance only.
- **Rollback:** `DROP FUNCTION annual_review_instance_change_log(...)` plus a single-file revert.

## Documentation

ADR-238 plus POLICY §AR-ADMIN-FINAL-OUTCOME-VISIBILITY (admin-only visibility of final score,
exemption and change log; access enforced inside the definer function, never by the client), and a
version-history entry in DOCUMENTATION.md.
