

# Fix Multi-Evidence Visibility Across All Review Stages

## Problem

Jitendra uploaded 5 evidence files for the "Statutory Compliance" KPI, but downstream reviewers (Manager, HR PMS) see only 1 file. The screenshot confirms only a single "Evidence" link appears in the Review Journey section.

There are **three layers** of breakage:

1. **Saving**: The `UnifiedScorecard` (used by Manager, HR PMS, Auditor, Management) only saves to the single-string `*_evidence_url` column, never to the `*_evidence_urls` JSONB array. Additionally, the `MultiFileUpload` callback discards all but the last uploaded URL.

2. **Data Passing**: `KpiJourneySection` (the Review Journey component) only reads the single `*_evidence_url` field and never checks `*_evidence_urls` arrays.

3. **Rendering**: `ReviewStageCard` (each card in the Review Journey) only accepts a single `evidenceUrl` prop and renders one link.

## Changes

### 1. `src/components/review/ReviewStageCard.tsx`
- Change the `evidenceUrl` prop from `string | null` to `evidenceUrls: string[]`
- Render multiple evidence links with numbered labels when more than one exists
- Show "Evidence 1", "Evidence 2", etc. for multiple files; just "Evidence" for a single file

### 2. `src/components/review/KpiJourneySection.tsx`
- For each stage (self, manager, skip_level, hr_pms, auditor, management), read the `*_evidence_urls` JSONB array first, falling back to the single `*_evidence_url` string
- Pass the result as `evidenceUrls: string[]` to `ReviewStageCard`

### 3. `src/components/review/UnifiedScorecard.tsx`
- Change `reviewerEvidenceUrl` state from `string | null` to `reviewerEvidenceUrls: string[]`
- Update `MultiFileUpload` `onUploadComplete` to store the full URL array (not just the last one)
- When saving (both `submitReview` mutation and N/A override path), write to **both** `*_evidence_url` (first URL for backward compat) and `*_evidence_urls` (full array)
- When loading existing data, read from `*_evidence_urls` first with fallback to `*_evidence_url`

### 4. `DOCUMENTATION.md`
- Update the multi-file evidence section to note that all review stages (including the Review Journey display) now support multi-file evidence

## Technical Detail

```text
// KpiJourneySection - building the URL array per stage
const selfUrls = Array.isArray(submission?.self_evidence_urls) && submission.self_evidence_urls.length > 0
  ? submission.self_evidence_urls
  : submission?.self_evidence_url ? [submission.self_evidence_url] : [];

// ReviewStageCard - rendering multiple links
{evidenceUrls.map((url, idx) => (
  <a key={idx} href={url} target="_blank">
    Evidence {evidenceUrls.length > 1 ? idx + 1 : ''}
  </a>
))}

// UnifiedScorecard - saving both columns
updateData[`${prefix}_evidence_url`] = reviewerEvidenceUrls[0] || null;
updateData[`${prefix}_evidence_urls`] = reviewerEvidenceUrls;
```

## Impact

- All 5 evidence files will be visible to all downstream reviewers
- Backward compatible: falls back to single-URL column for old data
- No database or schema changes needed (columns already exist)
- Consistent behavior across Self Review, Team Review, and all reviewer stages

