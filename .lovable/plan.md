

## Daily KPI Monthly Submission — Silent Failure & Missing Feedback

### Bugs Found

**Bug 1: `handleSubmitMonthlyReview` silently swallows errors**
`SelfReviewSheet.tsx` line 392-423 — the `try/finally` block has no `catch`. If `submitReview.mutateAsync` throws (RLS error, network failure, governance lock), the error is swallowed, the sheet closes (`onOpenChange(false)`), and the user sees no feedback. They believe the monthly submission succeeded when it didn't.

**Bug 2: `performSubPeriodSubmit` drops `evidence_urls`**
`SelfReviewSheet.tsx` line 437-448 — passes `evidence_url` (single legacy URL) but never passes `evidence_urls` (the array). The hook's upsert logic falls back to an empty array, silently dropping all uploaded evidence files for daily/weekly sub-period submissions made through the SelfReviewSheet.

**Bug 3: `handleSubmitReview` (monthly non-daily) also has no error handling**
`SelfReviewSheet.tsx` line 481 — `submitReview.mutateAsync` is awaited with no try/catch. If it fails, the unhandled rejection crashes silently. The sheet closes on success (line 491) but there's no user feedback on failure.

**Bug 4: `performSubPeriodSubmit` doesn't reset `selfEvidenceUrls`**
Line 449 resets `selectedSubPeriod`, `achievedValue`, `calculatedScore`, `selfRemarks`, and `resubmitReason` — but NOT `selfEvidenceUrls`. After submission, stale evidence URLs persist in state and will be silently attached to the next submission.

### Fixes

#### `src/components/review/SelfReviewSheet.tsx`

1. **Bug 1** — Add `catch` block to `handleSubmitMonthlyReview`:
   - Show destructive toast with error message
   - Do NOT close the sheet on error (remove `onOpenChange(false)` from try, keep it only on success path after the await)

2. **Bug 2** — Add `evidence_urls: selfEvidenceUrls` to the `performSubPeriodSubmit` mutation call (line 443, alongside `evidence_url`)

3. **Bug 3** — Wrap `handleSubmitReview`'s `submitReview.mutateAsync` in try/catch with error toast

4. **Bug 4** — Add `setSelfEvidenceUrls([])` to the reset on line 449

### Files Modified
- `src/components/review/SelfReviewSheet.tsx` — 4 targeted fixes (error handling + evidence_urls + state reset)

### Risk
Minimal. All fixes are additive (error feedback) or corrective (missing parameter, missing state reset). No behavioral changes to success paths.

