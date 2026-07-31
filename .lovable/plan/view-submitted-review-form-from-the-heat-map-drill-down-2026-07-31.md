# View submitted review form from the Heat Map drill-down

## What the user gets

Each employee row in the expanded heat map panel gets a new **View form** action (eye icon, before the Calibrate icon). Clicking it opens a read-only dialog for that employee with everything behind the score:

1. **Header** — employee code, name, grade, cycle, status badge, Final Score (/100), Effective Rating (/5) with a "Calibrated" badge when applicable, and Slab %.
2. **Self review (form submitted by the employee)** — every self-review field label with the employee's answer, plus their criteria ratings and comments, and submission date.
3. **Reviewer remarks by stage** — one block per submitted stage (Manager, Dept Head, BU Head, HR, Management): reviewer name, submitted date, per-criterion rating and the reviewer's comment/remark text. Stages with no response show "Not submitted".
4. **System scores** — each system slot (e.g. carry-KRA, Safety, Production) with its raw/achieved value, weight and resolved points.
5. **How this score was calculated** — the existing `ScoreBreakdownCard` breakdown table (parameter, type, achieved, out of, weight, contribution, totals, scoring mode), reused as-is so the arithmetic matches the employee's own view and the report export.
6. Footer link **Open full review** → `/annual-review/team/{instanceId}` for anyone with access, and Close.

Access: the dialog is read-only for everyone; nothing here grants new visibility — rows and responses are only shown when the existing report and RLS already return them.

## Technical notes

- New hook `src/hooks/annualReview/useInstanceReviewForm.ts`: one query keyed `['ar','review-form',instanceId]` that fetches the instance (template_id, criteria/system scores, total_score, status, self-review payload), its `annual_review_responses` rows (reviewer_role, reviewer_id + name, criteria_scores, comments, submitted_at, weighted_score) and the resolved template. Enabled only while the dialog is open.
- New `src/components/annual-review/ReviewFormViewerDialog.tsx`: presentation only. Stage ordering uses the canonical stage order helper already used elsewhere; role → label mapping reuses the existing annual-review role labels. Renders `ScoreBreakdownCard` (defaultOpen) and a compact system-scores table.
- `BandEmployeeList.tsx`: add the eye button per row + local `viewInstanceId` state; column header "View". No change to existing columns, CSV export, selection or calibrate behaviour.
- Rating/slab values shown come from `effectiveRating.ts` + `ratingSlab.ts` SSOT — no hardcoded percentages.

## Risk & impact

- Data: read-only; no schema, RLS, RPC or migration change.
- Workflow/permissions: none. Existing RLS on `annual_review_instances` / `annual_review_responses` governs what loads; if a row is not visible the dialog shows an explicit "not available for your access" state instead of a blank panel.
- Performance: lazy per-instance fetch on open, cached 30s; no extra load on the report page.
- Regression: additive column in the drill-down table only; drill-down width grows by one icon column.
- Rollback: revert the two new files plus the small `BandEmployeeList.tsx` diff.

## Verification

- Unit test for the stage-block builder (ordering, missing stages, unlabelled criteria fall back to the criterion id).
- Manual: open a slab cell → View form for a KRA-driven employee (breakdown shows the KRA slot) and a criteria-driven one (breakdown shows criteria rows); confirm totals equal the row's Final Score.
- Docs: ADR-218e, POLICY §AR-BELL-CURVE item 12, DOCUMENTATION.md version bump.
