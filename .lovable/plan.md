

# Fix: Show Restore Warnings in UI + Fix Delete Order

## What Happened (The 6 Warnings)

| # | Table | Warning |
|---|---|---|
| 1 | `email_templates` | Table doesn't exist in the database |
| 2 | `email_notification_settings` | Table doesn't exist in the database |
| 3 | `divisions` | Can't delete -- `departments` still has rows referenced by `profiles` |
| 4 | `business_units` | Same FK cascade issue |
| 5 | `departments` | FK constraint `profiles_department_fk` on `profiles` table |
| 6 | `profiles` | FK constraint `password_rollout_logs_generated_by_fkey` -- `password_rollout_logs` not cleared first |

## Root Causes

1. **Missing table in delete order**: `password_rollout_logs` is not listed in `DELETE_ORDER`, so it still has rows referencing `profiles` when the restore tries to clear `profiles`. This cascades up -- `departments`, `business_units`, and `divisions` can't be cleared either.
2. **Non-existent tables**: `email_templates` and `email_notification_settings` are listed in the backup/restore arrays but don't exist in the database schema.
3. **No warning details in UI**: The `onSuccess` handler only shows a toast with a count ("6 warnings") but never reveals what went wrong.

## Corrective Actions

### Fix 1: Update Edge Function Delete/Insert Order

**File: `supabase/functions/restore-backup/index.ts`**

- Remove `email_templates` and `email_notification_settings` from both `DELETE_ORDER` and `INSERT_ORDER` (tables don't exist)
- Add `password_rollout_logs` to `DELETE_ORDER` before `profiles` (leaf table that references profiles)
- Add `password_rollout_logs` to `INSERT_ORDER` after `profiles` and `user_roles`

### Fix 2: Show Warning Details in UI After Restore

**File: `src/components/admin/BackupRestoreTab.tsx`**

- Add state to store the last restore result (warnings array)
- After a restore completes with warnings, display an expandable alert/card below the restore button showing each warning message
- Use an `AlertTriangle` icon with amber styling and a collapsible list of errors

**File: `src/hooks/useBackups.ts`**

- Update `useTriggerRestore` and `useUploadAndRestore` to return the full result (including `errors` array) so the UI component can access it
- Instead of only showing a toast, pass the result data back to the calling component

### Fix 3: Update create-backup Edge Function

**File: `supabase/functions/create-backup/index.ts`**

- Remove `email_templates` and `email_notification_settings` from the backup table list
- Add `password_rollout_logs` to the backup table list

### Fix 4: Update Documentation

**File: `DOCUMENTATION.md`**

- Document the restore warning display behavior
- Update the backed-up table list

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/restore-backup/index.ts` | Fix DELETE_ORDER and INSERT_ORDER arrays |
| `supabase/functions/create-backup/index.ts` | Fix table list (remove non-existent, add missing) |
| `src/hooks/useBackups.ts` | Return restore result data to component |
| `src/components/admin/BackupRestoreTab.tsx` | Show warning details in a visible alert after restore |
| `DOCUMENTATION.md` | Update backup/restore documentation |

## Expected Result

- Restore will complete with **0 warnings** (all FK dependencies resolved in correct order)
- If any warnings do occur, the admin will see a detailed list on-screen -- not just a count in a toast

