

# Fix: Multi-Evidence Still Showing Only 1 File

## Root Cause

Two issues are causing this:

1. **Database has empty arrays**: Every `review_submissions` record has `self_evidence_urls: []` because submissions were made before the recent code fix was deployed. The 5 files Jitendra uploaded are in storage but only 1 URL was saved (to the old `self_evidence_url` single-string column).

2. **Missing TypeScript fields**: The `ReviewSubmission` interface in `useKpis.ts` does not include any of the `*_evidence_urls` array fields. All access to these fields relies on unsafe `(submission as any)` casts, which is error-prone and prevents proper type checking.

## Solution

### 1. Database Migration: Sync existing single URLs into array columns

Run a one-time migration that copies the single-string `*_evidence_url` value into the corresponding `*_evidence_urls` JSONB array for all rows where the array is empty but the single string exists. This immediately makes all existing evidence visible without requiring re-submission.

```sql
UPDATE review_submissions
SET self_evidence_urls = jsonb_build_array(self_evidence_url)
WHERE self_evidence_url IS NOT NULL
  AND (self_evidence_urls IS NULL OR self_evidence_urls = '[]'::jsonb);

-- Same for manager, auditor, management, skip_level, hr_pms
UPDATE review_submissions
SET manager_evidence_urls = jsonb_build_array(manager_evidence_url)
WHERE manager_evidence_url IS NOT NULL
  AND (manager_evidence_urls IS NULL OR manager_evidence_urls = '[]'::jsonb);

-- (repeat for all 6 reviewer levels)
```

### 2. Update ReviewSubmission TypeScript Interface (`src/hooks/useKpis.ts`)

Add the missing `*_evidence_urls` array fields so all components can access them without `as any` casts:

```text
self_evidence_urls: string[] | null;
manager_evidence_urls: string[] | null;
auditor_evidence_urls: string[] | null;
management_evidence_urls: string[] | null;
skip_level_evidence_urls: string[] | null;
hr_pms_evidence_urls: string[] | null;
```

### 3. Remove `as any` Casts (`src/components/review/KpiJourneySection.tsx`)

Replace all `(submission as any)?.self_evidence_urls` style casts with direct property access now that the type includes them.

### 4. Update DOCUMENTATION.md

Note the data migration and type update.

## Files Changed

| File | Change |
|---|---|
| Database migration | Sync single-URL data into JSONB arrays for all 6 review levels |
| `src/hooks/useKpis.ts` | Add `*_evidence_urls` fields to `ReviewSubmission` interface |
| `src/components/review/KpiJourneySection.tsx` | Remove unsafe `as any` casts |
| `DOCUMENTATION.md` | Document migration and type update |

## Impact

- Jitendra's existing evidence (and all other users') will immediately appear without re-submission
- Type-safe access to multi-evidence arrays across all components
- No UI or logic changes needed -- the display components already handle arrays correctly
