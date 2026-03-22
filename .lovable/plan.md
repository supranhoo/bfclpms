

## Show Last Self-Review Submission Date on KPI Details Header

### What
Add a date indicator to the left of "KRA Export" button showing when the employee last submitted a self-review for regular KPIs (excluding org KPIs and bi-monthly/quarterly/half-yearly/yearly KPIs). This helps reviewers quickly see when the employee completed their self-review.

### Files to Modify

#### 1. `src/hooks/useKpis.ts` (line 116)
Add `submitted_at` and `updated_at` to the `ReviewSubmission` interface — the query already fetches `*` so data is available, just not typed.

#### 2. `src/components/review/UnifiedScorecard.tsx` (lines 1357-1373)
Compute the last submission date from regular KPIs:
- Filter `kpis` to exclude `is_org_level` and non-monthly frequencies
- Filter to only KPIs past `kra_set` status (i.e., self-review done)
- Get their submissions from `submissionMap`, find the max `submitted_at`
- Display as a small badge/text like `Self reviewed: 15 Mar` to the left of the KRA Export button

### UI
A subtle text/badge with a calendar icon showing the date, positioned left of the KRA Export button in the header row. Only shown when a date exists.

### No database changes needed

