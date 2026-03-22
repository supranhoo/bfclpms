

## Fix: "Cannot coerce the result to a single JSON object" Error

### Root Cause
`useSystemSetting()` in `src/hooks/useSystemSettings.ts` (line 55) uses `.single()` which throws when 0 rows are returned. If a setting key like `pending_review_deadline_day` doesn't exist yet in the `system_settings` table, this crashes.

### Fix

**File: `src/hooks/useSystemSettings.ts`, line 55**

Change `.single()` to `.maybeSingle()`. All consumers already handle `data` being null/undefined via optional chaining and defaults.

### No database changes needed

