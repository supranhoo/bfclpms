

# Surface ALL Validation Errors -- No Silent Drops

## Problem

The current import logic has two issues that cause errors to be silently swallowed:

1. **10% threshold gate (lines 1065-1077)**: If fewer than 10% of rows fail validation AND the count is 5 or fewer, the errors are silently discarded. The 202 response only contains `totalRows` for the valid rows -- zero mention of skipped rows.

2. **50-error cap (lines 1042-1045)**: Validation stops after 50 errors, leaving remaining rows unvalidated entirely.

**New rule: Every validation error must be reported to the user at upload time, regardless of quantity.**

## Changes

### 1. Edge Function (`supabase/functions/import-kpis/index.ts`)

**Remove the 50-error early exit** (lines 1041-1045):
- Remove the `if (validationErrors.length >= 50) { break; }` block
- Let all rows validate so we get the complete error list
- Cap only the *response payload* (not the validation loop) to 500 errors to avoid oversized responses

**Remove the 10% silent-pass gate** (lines 1065-1077):
- Delete the `failureRate > 0.1` block entirely
- Instead, always proceed with valid rows AND always include skipped-row info in the response

**Update the 202 success response** (lines 1087-1098):
- Add `skippedRows`, `validationErrors` (capped at 500), and `totalErrors` fields so the frontend always knows what was dropped

```text
{
  success: true,
  message: "Import started. Processing 2948 rows...",
  importId: "import-...",
  totalRows: 2948,
  skippedRows: 1,
  totalErrors: 1,
  validationErrors: ["Row 722: managerRating must be <= 10"]
}
```

**Keep the "all rows failed" rejection** (lines 1051-1063):
- If `validatedData.length === 0`, still return 400 -- nothing to import.

### 2. Frontend (`src/pages/admin/ImportData.tsx`)

**After receiving 202 response** (around line 755):
- Check `result.skippedRows > 0`
- If true, build `ImportRowResult[]` entries with status `'skipped'` from `result.validationErrors`
- Immediately display `ImportResultsSummary` so the user sees the skipped rows right away (alongside the background progress tracker)
- Update the toast to: "Import started -- 1 row skipped due to validation errors"

### 3. Documentation (`DOCUMENTATION.md`)

- Add note in Section 4.21: "All pre-import validation errors are surfaced in the UI as skipped rows, regardless of how many or few fail. No error is silently dropped."

## What Stays the Same

- Background processing errors (DB insert failures during batch processing) continue to be tracked via the `import_progress` table -- unchanged
- Foreground import error reporting -- unchanged (already shows all errors)
- The `validateAndSanitizeRow` function itself -- unchanged

