# Admin: Update System Score details from the review page

Admins get an "Update system scores" action next to "Fill eligibility inputs" on the Annual Review detail page. It opens a dialog where the admin edits the **raw achievement value** for each System Score item (LTI count, 5S %, Trainings attended, …). Points are auto-computed from the template's scoring bands, shown live before saving. Corrections are allowed **in both directions**, on any status **including Completed**, and every change is audit-logged with a mandatory reason.

## Scope decisions (confirmed)
- Edit raw achievement values only; appraisal points are derived, never typed.
- Up and down corrections allowed, including finalised reviews.
- Visible to the **Admin** role only (HR PMS keeps eligibility editing only).

## Assumptions
- Carry-KRA slots stay read-only (computed live from monthly KRA data) — they are excluded from the editor.
- Slots without scoring bands accept the raw number and store it as points 1:1, matching bulk-upload behaviour.

## Risk & impact
- **Data:** additive. Writes `system_scores_raw` + `system_scores` on `annual_review_instances`, plus one audit row per change. No schema change to existing columns.
- **Workflow:** no stage/status transitions are triggered; only score fields and the recomputed final score/rating change.
- **Regression:** editing a Completed review can change the final score and therefore the Final Rating (/5) and increment slab (ADR-212). Mitigated by the mandatory reason, a "this review is completed" warning in the dialog, before/after diff preview, and a full audit trail.
- **Scalability:** single-instance edit, a handful of slots — no pagination concerns.
- **Rollback:** every change records the previous raw value and points, so a correction can be reversed by re-entering the recorded prior value.

## Implementation

### Backend (migration)
1. New audit table `annual_review_system_score_edits` — instance id, slot id, slot name, old/new raw, old/new points, old/new final score, reason, edited_by, timestamp. Admin-read only, service_role full; RLS enabled; GRANTs included.
2. New `SECURITY DEFINER` RPC `admin_update_system_scores_raw(p_instance_id, p_raw jsonb, p_points jsonb, p_reason text)`:
   - Rejects callers without the `admin` role and empty reasons.
   - Merges the supplied slots into `system_scores_raw` / `system_scores` (bidirectional, unlike the monotonic ADR-171 upgrade path, which stays untouched for bulk upload).
   - Recomputes the final summary/score via the existing `annual_review_compute_final_summary` path so Completed rows stay consistent with the Annual Review Report.
   - Writes one audit row per changed slot and one `annual_review.system_scores_admin_edit` entry to the standard audit log.

### Frontend
- `src/components/annual-review/AdminSystemScoresDialog.tsx` (new): one row per non-carry slot with a labelled numeric input, unit hint, live "→ X.XX / weight points" preview using the existing `scoreFromRaw` SSOT, a changed-rows diff summary, required reason textarea, and an amber warning + explicit confirm when the instance is `completed`.
- `src/services/annualReview/adminSystemScores.ts` (new): thin service calling the RPC; `useAdminUpdateSystemScoresRaw` hook invalidating the annual-review query keys.
- `src/components/annual-review/TeamReviewDetailContent.tsx`: add the admin-only trigger button beside "Fill eligibility inputs" and mount the dialog. No other layout change.

### UI change summary
- Location: Annual Review detail page, directly under the System Scores card, to the right, next to the existing "Fill eligibility inputs" button.
- Visual: a second outline button "Update system scores" with a pencil icon; only rendered for admins and only when the template has editable system-score slots.
- Interaction: opens a modal dialog; Save is disabled until at least one value changed and a reason is entered; success toast + card refresh; failure surfaces an error toast.
- Responsive: dialog scrolls on small screens, inputs stack to one column below `sm`.

## Tests
- `src/test/annualReview/adminSystemScoresDialog.test.tsx` — raw→points preview, carry-KRA slots hidden, save blocked without a reason, completed-instance warning shown.
- Service unit test for payload shaping (only changed slots sent).

## Documentation
- `docs/adr/ADR-217.md` — Admin System Score correction path.
- `POLICY.md` §AR-SYSTEM-SCORE-ADMIN-CORRECTION — admin-only, reason mandatory, bidirectional, audit-logged, final score recomputed.
- `DOCUMENTATION.md` version history entry.
