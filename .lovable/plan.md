

# Fix: Attachments Vanish on Chrome Tab Switch

## Root Cause

The bug is in `SelfReviewSheet.tsx`. The form initialization runs inside a `useEffect` (line 213-275) with `submissionMap` as a dependency:

```ts
useEffect(() => {
  if (!selectedKpi || !open) return;
  const existing = submissionMap.get(selectedKpi.id);
  // ... resets ALL form state including evidence URLs
  setSelfEvidenceUrls(existingUrls);
}, [selectedKpi, open, submissionMap, orgKpiValuesMap, profile, calculateScoreFromAchieved]);
```

When you switch Chrome tabs and return, React may re-render the parent Dashboard component, which creates a new `submissionMap` Map instance (even with the same data). This triggers the `useEffect`, which **overwrites evidence URLs from the database** -- wiping out any files you uploaded but hadn't submitted yet.

The other scorecard components (UnifiedScorecard, EmployeeScorecard, AuditScorecard, ManagementScorecard) are NOT affected because they initialize form state inside an `openReviewSheet()` function (runs only on click), not in a `useEffect`.

## Fix Plan

### File: `src/components/review/SelfReviewSheet.tsx`

Add a ref to track whether the form has already been initialized for the current KPI+open state. The `useEffect` should only run its initialization logic when the KPI changes or the sheet opens -- not when `submissionMap` changes while the sheet is already open.

**Changes:**
1. Add a `lastInitializedKpiId` ref to track which KPI was last initialized
2. Guard the useEffect: only reset form state when `selectedKpi.id` changes or when the sheet freshly opens
3. Remove `submissionMap` from the dependency array (read it via a ref instead, or restructure the guard)

```ts
const lastInitializedRef = useRef<string | null>(null);

useEffect(() => {
  if (!selectedKpi || !open) {
    lastInitializedRef.current = null;
    return;
  }

  // Skip re-initialization if already initialized for this KPI
  if (lastInitializedRef.current === selectedKpi.id) return;
  lastInitializedRef.current = selectedKpi.id;

  const existing = submissionMap.get(selectedKpi.id);
  // ... rest of initialization logic unchanged
}, [selectedKpi, open, submissionMap, orgKpiValuesMap, profile, calculateScoreFromAchieved]);
```

This ensures:
- Opening the sheet for a KPI: initializes form (including loading evidence from DB)
- Switching Chrome tabs and back: skips initialization (preserves uploaded evidence)
- Opening a different KPI: re-initializes (loads that KPI's data)
- Closing and reopening the same KPI: re-initializes (resets the ref on close)

### File: `DOCUMENTATION.md`

- Version bump to 1.45.39
- Note: Fixed attachment loss on Chrome tab switch in Self Review sheet

## What Will NOT Change

- UnifiedScorecard, EmployeeScorecard, AuditScorecard, ManagementScorecard -- these already use event-driven initialization and are not affected
- MultiFileUpload component -- works correctly; the issue is in the parent's state management
- No database or schema changes needed

## Expected Outcome

| Scenario | Before (Bug) | After (Fix) |
|---|---|---|
| Upload evidence, switch Chrome tab, return | Evidence URLs reset to empty | Evidence URLs preserved |
| Upload evidence, close sheet, reopen same KPI | Re-initializes from DB | Re-initializes from DB (correct) |
| Open different KPI after uploading | Loads new KPI data | Loads new KPI data (correct) |

