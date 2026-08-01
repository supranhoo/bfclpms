# View the source review form from a recommendation

## What you get
Every row in the Recommendations queue gets a **View form** action (file icon, left of **Decide**, tooltip "View submitted review form"). Clicking it opens the existing read-only review-form viewer for that employee's annual review instance — the same wide side-by-side matrix already used from the Bell Curve heat-map drill-down (ADR-218e / 218f).

Inside it you see:
- Self / Dept Head / BU Head / Management ratings and per-criterion remarks side by side
- The reviewer's **Overall recommendation** narrative — the exact prose the promotion / training / monetary ask came from
- System scores and the "How this score was calculated" breakdown

The narrative text in the queue also becomes clickable (same action), so any referenced recommendation leads straight to its source form. Legacy-imported rows behave identically, since they carry the same instance reference.

## Technical notes
- `RecommendationQueueRow` already exposes `instance_id` — no RPC, schema or RLS change needed.
- `RecommendationsTab.tsx` gains one `viewInstanceId` state and mounts the existing `ReviewFormViewerDialog` (`instanceId`, `onClose`), which fetches via `useInstanceReviewForm` under existing RLS.
- If access is denied or the instance is missing, the dialog's existing error state shows the message — never a silent blank.
- Presentation-only; no business logic moves into the component.

## Risk & impact
- Data: read-only, no schema/RLS/migration.
- Workflow: additive action; decisions unaffected.
- UI/UX: one extra icon button per row plus a hover affordance on the narrative; column count unchanged (existing action cell reused).
- Regression risk: low — the dialog is already in production use from the heat map.
- Scale: the form loads per instance on demand (30s staleTime); the queue's paginated 25-row fetch is unchanged.
- Rollback: remove the state, the dialog mount and the icon button.

## Tests
A small pure test asserting the queue-row → viewer contract (`instance_id` present and non-empty for both `stage_form` and `legacy_import` rows), so a future RPC change cannot silently drop the link.

## Docs
DOCUMENTATION.md (ADR-226 section) and POLICY.md §AR-RECOMMENDATION-TRACKING gain the traceability rule: every recommendation row must link back to its source review form.