---
name: Audit Review Journey staleness guard
description: How the Audit Review sheet keeps Self/Manager tiles in sync with review_submissions
type: feature
---

RCA Jun-2026: Auditor saw "N/A" for Self/Manager in the Audit Review sheet
while the `review_submissions` row existed (self=5, manager=5) and RLS
permitted the read. Cause was client-side staleness, not access.

Contract for `AuditScorecard` + `KpiJourneySection` + `ReviewStageCard`:

1. **Fallback chain for `submission` in the sheet:**
   `submissionMap.get(selectedKpi.id) ?? allSubmissions?.find(...) ?? null`.
   Never drop the `allSubmissions` step — the current-period query key
   (`['review-submissions', kpiIds]`) can hold a snapshot that pre-dates a
   just-inserted row.
2. **On `openReviewSheet`:** invalidate `['review-submissions']` and
   `['kpis', employee.id]` before reading. This is in addition to
   post-mutation invalidations.
3. **Realtime subscription while the sheet is open:** filter
   `review_submissions` by `kpi_id=eq.${selectedKpi.id}` and invalidate on
   any change. Tear the channel down on close.
4. **Loading vs empty in the tiles:** `ReviewStageCard` accepts
   `isLoading`. Parent must pass `isLoading={useReviewSubmissions(...).isLoading && !submission}`.
   Pending stages never render the skeleton — they stay muted.

Regression tests: `src/test/reviewStageCardLoading.test.tsx`,
`src/test/auditScorecardSubmissionFallback.test.ts`.