

# Daily KPI Evidence Upload -- Per-Day Supporting Documents

## Summary

Add the ability for employees to upload supporting evidence (files/images) for each daily submission. These uploads will be visible to all reviewers (Manager, Skip-Level, HR PMS, Auditor, Management) when viewing the daily submission summary.

## Current State

- The `sub_period_submissions` table already has an `evidence_url` (text) column, but it is **never used** -- the Daily and Weekly submission grids don't expose any upload UI.
- The `DailySubmissionSummary` (reviewer-facing table) does not display any evidence column.
- The platform's multi-file pattern uses a JSONB array column (`evidence_urls`) alongside the legacy single-string column.

## What Changes

### 1. Database: Add `evidence_urls` JSONB Column

Add a `evidence_urls` JSONB column to `sub_period_submissions` to support multi-file uploads per day (up to 5 files), consistent with the existing pattern used in `review_submissions` and `org_kpi_values`.

### 2. Employee View: `DailySubmissionGrid.tsx`

When editing a day entry:
- Show a compact `MultiFileUpload` component below the value/remarks inputs.
- Pass the uploaded URLs into the `useSubmitSubPeriod` mutation.
- Display a small file icon/badge on submitted rows that have evidence, linking to the files.

### 3. Employee View: `WeeklySubmissionTable.tsx`

Same treatment -- add `MultiFileUpload` to weekly entry editing for consistency.

### 4. Reviewer View: `DailySubmissionSummary.tsx`

Add an "Evidence" column to the submissions table:
- Show a clickable file icon with a count badge (e.g., a paperclip icon with "2") when evidence exists for a day.
- Clicking opens the file via the existing blob-based download mechanism (`openStorageFile`).
- Visible to all reviewer levels.

### 5. Hook: `useSubPeriodSubmissions.ts`

- Update the `SubPeriodSubmission` interface to include `evidence_urls: string[] | null`.
- Update the `useSubmitSubPeriod` mutation to accept and persist both `evidence_url` (legacy, last file) and `evidence_urls` (JSONB array).

### 6. Documentation

Version bump to **1.45.76** with changelog entry.

## Technical Details

| Aspect | Detail |
|--------|--------|
| Files changed | `sub_period_submissions` (migration), `DailySubmissionGrid.tsx`, `WeeklySubmissionTable.tsx`, `DailySubmissionSummary.tsx`, `useSubPeriodSubmissions.ts`, `DOCUMENTATION.md` |
| New DB column | `evidence_urls JSONB DEFAULT '[]'` on `sub_period_submissions` |
| Storage bucket | Existing `review-evidence` bucket (already public + authenticated) |
| Upload path | `{userId}/{kpiId}/daily-evidence/{timestamp}.{ext}` |
| Max files per day | 5 (consistent with platform standard) |
| Data impact | Additive -- new nullable column, no existing data affected |
| RLS impact | None -- uses existing `sub_period_submissions` RLS policies |
| Regression risk | Very low -- additive UI change, existing flows unchanged |

## User Experience Flow

1. Employee opens Daily KPI submission grid
2. Clicks "Enter" or "Edit" for a day
3. Sees the existing value + remarks inputs, plus a new compact file upload area
4. Uploads supporting documents (photos, PDFs, spreadsheets)
5. Saves the submission -- files are stored and linked to that day's record
6. Manager (or any reviewer) opens the employee's KPI review
7. In the Daily Submission Summary table, sees a file/paperclip icon on days that have evidence
8. Clicks the icon to view/download the uploaded files

