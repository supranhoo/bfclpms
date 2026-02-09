

# Configurable Backup Schedules

## Overview
Replace the fixed "Weekly Sunday 2 AM" backup toggle with a configurable schedule builder. Admins can choose the frequency (daily, weekly, monthly), the day of the week (for weekly), and the time -- all from the UI.

## How It Works

1. Admin enables scheduled backups and picks frequency, day, and time from dropdowns.
2. The selected schedule is saved as a system setting (`backup_schedule`), e.g. `{"frequency":"weekly","day":"sunday","hour":2}`.
3. A backend function (`update-backup-schedule`) receives the new schedule, deletes the old `pg_cron` job, and creates a new one with the correct cron expression.
4. The UI shows a human-readable summary of the active schedule.

## Schedule Options

| Frequency | Additional Options | Cron Example |
|-----------|-------------------|--------------|
| Daily | Hour (0-23) | `0 2 * * *` |
| Weekly | Day of week + Hour | `0 2 * * 0` (Sunday) |
| Monthly | Day of month (1-28) + Hour | `0 2 15 * *` (15th) |

## Database Changes

### New/Updated System Setting
- Key: `backup_schedule` 
- Value: JSON object `{"frequency":"weekly","day":"sunday","hour":2,"dayOfMonth":1}`
- The existing `auto_backup_enabled` setting stays as the on/off toggle.

### Edge Function: `update-backup-schedule`
- Accepts `{ frequency, day, hour, dayOfMonth }` from the admin UI
- Builds the cron expression from the parameters
- Calls `cron.unschedule('weekly-database-backup')` to remove the old job
- Calls `cron.schedule(...)` to create the new job with the updated expression
- Saves the schedule JSON to `system_settings`
- Requires admin role

## Frontend Changes

### `src/hooks/useBackups.ts`
- Add `useBackupSchedule()` hook: reads the `backup_schedule` system setting
- Add `useUpdateBackupSchedule()` mutation: calls the `update-backup-schedule` edge function
- Keep `useAutoBackupSetting()` for the enable/disable toggle

### `src/components/admin/BackupRestoreTab.tsx`
- Replace the simple toggle section with a "Scheduled Backup" card containing:
  - Enable/disable switch (existing toggle)
  - Frequency dropdown: Daily, Weekly, Monthly
  - Day of week dropdown (shown only when frequency = weekly): Monday through Sunday
  - Day of month dropdown (shown only when frequency = monthly): 1-28
  - Hour dropdown: 00:00 - 23:00 UTC
  - "Save Schedule" button to apply changes
  - Human-readable summary: e.g. "Every Sunday at 02:00 UTC"

### `DOCUMENTATION.md`
- Update the backup section to document configurable schedules

## File Summary

| File | Action |
|------|--------|
| `supabase/functions/update-backup-schedule/index.ts` | Create |
| `src/hooks/useBackups.ts` | Modify (add schedule hooks) |
| `src/components/admin/BackupRestoreTab.tsx` | Modify (schedule UI) |
| `DOCUMENTATION.md` | Update |

## Technical Considerations

- Day of month is capped at 28 to avoid issues with shorter months (Feb).
- The cron job name stays `weekly-database-backup` (reused) so there is always exactly one scheduled job.
- If the admin disables scheduled backups, the cron job is unscheduled entirely. Re-enabling recreates it with the saved schedule.
- The edge function uses `supabase_functions.http_request` or direct SQL via service role to manage cron jobs.

