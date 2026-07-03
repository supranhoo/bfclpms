## Add "Save System Scores" action to HR Finalization sheet

Today the HR Finalization sheet only persists system-score overrides as part of the full **Finalize** submit. HR can't save the scores incrementally, and finalize is blocked until every reviewer stage is locked — so mid-cycle score entry has no save path.

### Change
Add a dedicated **Save system scores** button that persists only `annual_review_instances.system_scores` (merged with existing values), independent of finalization.

### Files
1. **`src/services/annualReview/annualReviewService.ts`** — Add `updateSystemScores(instanceId, systemScores)` that updates only the `system_scores` jsonb column and `updated_at`. Does not change `status`, `final_rating`, or `hr_remarks`.
2. **`src/hooks/useAnnualReview.ts`** — Add `useUpdateSystemScores()` mutation hook wrapping the service call, invalidating `annualReviewKeys.all` on success.
3. **`src/components/annual-review/HrFinalizationSheet.tsx`** — Inside the `SystemScoresPanel` card area, add a small **Save system scores** button (with spinner). Enabled whenever there are unsaved overrides OR an instance exists; disabled while pending. Calls the new hook with the `merged` map. Toast on success/error. Clears `systemOverrides` local state on success so the panel reflects the persisted values.
4. **`src/test/annualReview/hrFinalizationSaveSystemScores.test.ts`** — New test: mocks the service, renders the sheet with a non-finalizable instance (missing stages), simulates a score change, clicks Save system scores, asserts the service is called with the merged map and that finalize is NOT invoked.
5. **`src/modules/annual-review/DOCUMENTATION.md`** — Version-history entry describing the new incremental save path.
6. **`src/modules/annual-review/POLICY.md`** — Note: system scores may be saved by HR at any time before finalization; finalization still requires all reviewer stages locked.

### Risk & impact
- **Data**: Additive UPDATE on an existing jsonb column. No schema change. RLS unchanged (existing HR/admin update policy on `annual_review_instances` already covers this column).
- **Workflow**: Non-destructive — does not advance stage or set `final_rating`. Finalize button behavior unchanged.
- **UI**: One new button inside the System Scores card; layout otherwise unchanged.
- **Regression**: Low. The Finalize path continues to send `systemScores: merged`; if HR pre-saved, `merged` still equals persisted + overrides so the finalize payload is unchanged.
- **Rollback**: Revert the six files; no migration.

### Verification
- Unit test above passes.
- Manual: open sheet on an instance missing reviewer locks → confirm Save system scores works and reloading shows persisted values; Finalize remains disabled with the same missing-stages alert.
