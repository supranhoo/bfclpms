## Assumptions
- The screenshot is from Annual Review Admin → Progress for the active cycle.
- The expected count is the full active, non-dummy employee roster.
- The current active cycle already has the correct rows in the backend.

## Clarifications
Not Applicable.

## Risk & Impact Report
- **Data Impact:** No schema or historical data change. Backend verification shows the active annual review cycle has **2,560** instances and **2,560** eligible profiles, so this is not a seeding/data-loss issue.
- **Workflow Impact:** No workflow or permission change.
- **UI/UX Impact:** Summary cards will show the full cycle counts instead of the first 1,000 returned by the Data API default cap.
- **Regression Risk:** Low. The fix is isolated to the count helper used by these cards.
- **Scalability Impact:** Current `getCycleStatusCounts()` reads `overall_status` without pagination, so the database returns only 1,000 rows by default. I’ll replace it with exact count queries/count aggregation that does not depend on returned row payload size.
- **Mitigation Plan:** Add/adjust a regression test so future annual-review summary counts cannot silently cap at 1,000 again.

## Step-by-step Plan
1. Update `getCycleStatusCounts(cycleId)` in `annualReviewService.ts` so it does not load an unpaged list of statuses.
   - Use exact database counts for total and each status bucket, or a count-only query strategy.
   - Keep the hook/UI API unchanged.
2. Add a regression test for the summary-count helper behavior beyond 1,000 rows.
3. Update `DOCUMENTATION.md` pagination/version-history notes to state summary counts are count-only and not row-list based.
4. Update `POLICY.md` reporting/pagination wording so large annual-review summaries must not use unpaged reads.

## UI Changes
- **Visual location:** Annual Review Admin → Progress summary cards.
- **Visual change:** Values should show **2,560** total and **2,560** self-review pending for the current active cycle, instead of **1,000**.
- **Interaction impact:** None.
- **Responsiveness:** No layout change.

## Implementation
Pending your approval to switch from plan mode to build mode.

## Tests
- Add/adjust unit test coverage for status counts over the 1,000-row default limit.

## DOCUMENTATION.md updates
- Document the fixed summary count contract and version-history entry.

## POLICY.md updates
- Add policy guardrail that summary/status counts must be count-only or paged, never unpaged list reads.

## Post-implementation notes
Root cause: `getCycleStatusCounts()` does `.select('overall_status')` without `.range()` or count-only aggregation. The backend has 2,560 rows, but the Data API returns only the first 1,000 rows by default, so the cards are capped at 1,000.