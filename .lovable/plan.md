

# Fix Clipboard Paste Upload in Team Review (UnifiedScorecard)

## Problem

In the Team Review view, Jaspal (and all users) cannot paste attachments via clipboard (Ctrl+V / Cmd+V). The upload works fine in other review views (Self Review, Audit, Management).

## Root Cause

`UnifiedScorecard.tsx` -- the component used for Team Review -- still uses the **old single-file `EvidenceUpload`** component, while all other scorecard components (`EmployeeScorecard`, `AuditScorecard`, `ManagementScorecard`, `SelfReviewSheet`) have already been upgraded to the newer **`MultiFileUpload`** component.

The `EvidenceUpload` paste handler has a subtle bug: it disables itself when `uploadedUrl` is truthy (line 113: `if (uploading || uploadedUrl) return`), and its scoping to `[role="dialog"]` may not match the Sheet container used in the UnifiedScorecard review panel.

Additionally, upgrading to `MultiFileUpload` will give team reviewers the same multi-file (up to 5) upload capability already available elsewhere.

## Solution

Replace `EvidenceUpload` with `MultiFileUpload` in `UnifiedScorecard.tsx` at both evidence upload locations (normal KPI review and daily binary review).

## Changes

### 1. `src/components/review/UnifiedScorecard.tsx`

**Import change:**
- Remove: `import { EvidenceUpload } from '@/components/ui/EvidenceUpload';`
- Add: `import { MultiFileUpload } from '@/components/ui/MultiFileUpload';`

**Two replacements (lines ~1167-1173 and ~1191-1197):**

Replace each `EvidenceUpload` instance:
```text
<EvidenceUpload
  userId={user.id}
  kpiId={selectedKpi.id}
  onUploadComplete={setReviewerEvidenceUrl}
  existingUrl={reviewerEvidenceUrl}
/>
```

With `MultiFileUpload`:
```text
<MultiFileUpload
  userId={user.id}
  contextId={selectedKpi.id}
  bucketFolder="review-evidence"
  existingUrls={reviewerEvidenceUrl ? [reviewerEvidenceUrl] : []}
  onUploadComplete={(urls) => setReviewerEvidenceUrl(urls[urls.length - 1] || '')}
  maxFiles={5}
/>
```

The `onUploadComplete` adapter ensures backward compatibility -- it stores the last uploaded URL in `reviewerEvidenceUrl` (existing state variable), maintaining compatibility with the save/approve logic.

### 2. `DOCUMENTATION.md`

Add a note that all scorecard components now use `MultiFileUpload` for consistent paste-to-upload and multi-file support.

## Impact

- Fixes paste-to-upload in Team Review
- Adds multi-file upload capability (up to 5 files) for team reviewers
- Consistent UX across all review levels
- No database or schema changes required
