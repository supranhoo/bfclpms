

# Automated Backup & Restore

## Overview
Add a full-database backup and restore system to the admin panel. Admins can trigger manual backups anytime, and a weekly scheduled backup runs automatically. Backup files are stored in cloud storage as JSON and can be downloaded or restored from the UI.

## Architecture

### How It Works

1. **Backup Edge Function** (`create-backup`): Reads all tables via service role, bundles them into a single JSON object, uploads to a `database-backups` storage bucket, and logs the backup metadata to a `backup_logs` table.

2. **Restore Edge Function** (`restore-backup`): Downloads a backup JSON from storage, truncates target tables in dependency order, and re-inserts data. Only admins can trigger this.

3. **Scheduled Trigger**: A `pg_cron` job calls the backup function weekly (every Sunday at 2 AM).

4. **Admin UI**: New "Backups" tab in System Settings with:
   - List of all backups (date, size, type, status)
   - "Backup Now" button for manual triggers
   - Download button for each backup
   - Restore button with confirmation dialog
   - Toggle to enable/disable scheduled backups

### Tables Included in Backup (~25 tables)
All public schema tables: `profiles`, `kpis`, `review_submissions`, `sub_period_submissions`, `kpi_queries`, `kpi_audit_logs`, `kpi_observations`, `notifications`, `kra_categories`, `departments`, `divisions`, `business_units`, `sub_branches`, `designations`, `pms_grades`, `review_periods`, `system_settings`, `app_settings`, `user_roles`, `modules`, `frequency_config`, `kpi_templates`, `template_bundles`, `template_bundle_items`, `kra_rollover_logs`, `org_kpi_values`, `org_kpi_data_owners`, `employee_working_days`, `performance_reviews`, `performance_improvement_plans`, `pip_milestones`, `pip_audit_logs`, `training_needs`, `workflow_templates`, `workflow_config`, `bundle_assignment_logs`, `import_progress`, `email_notification_settings`, `email_templates`.

Note: `auth.users` is excluded (managed by the auth system). Profile data is backed up via `profiles`.

## Database Changes

### New Storage Bucket
- `database-backups` (private bucket, admin-only access)

### New Table: `backup_logs`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| backup_type | text | `manual` or `scheduled` |
| status | text | `running`, `completed`, `failed` |
| file_path | text | Path in storage bucket |
| file_size_bytes | bigint | Size of backup file |
| tables_count | int | Number of tables backed up |
| total_rows | int | Total rows across all tables |
| created_by | uuid | Admin who triggered (null for scheduled) |
| error_message | text | Error details if failed |
| created_at | timestamptz | |
| completed_at | timestamptz | |

RLS: Only admins can read/write.

### New System Setting
- `auto_backup_enabled` (default: `enabled`) -- toggles the weekly cron job

### Cron Job
- Weekly on Sundays at 2:00 AM UTC calling `create-backup` function

## Edge Functions

### `create-backup/index.ts`
- Accepts `{ backup_type: 'manual' | 'scheduled' }`
- Uses service role key to read all tables
- Serializes data to JSON with table names as keys
- Uploads to `database-backups` bucket with timestamped filename (e.g., `backup-2026-02-09T02-00-00.json`)
- Creates entry in `backup_logs`
- JWT verification: false (called by cron), but validates admin role for manual triggers via Authorization header

### `restore-backup/index.ts`
- Accepts `{ backup_id: string }` (references `backup_logs.id`)
- Downloads backup JSON from storage
- Disables triggers temporarily during restore
- Truncates and re-inserts in correct dependency order (leaf tables first for delete, parent tables first for insert)
- Re-enables triggers
- Requires admin role (JWT verified)
- Creates audit log entry

## Frontend Changes

### New File: `src/components/admin/BackupRestoreTab.tsx`
- Backup list table with columns: Date, Type, Status, Size, Rows, Actions
- "Backup Now" button triggering the edge function
- Download button (generates signed URL from storage)
- Restore button with double-confirmation dialog ("This will replace ALL current data")
- Auto-backup toggle switch
- Loading states and progress indicators

### Modified: `src/pages/admin/SystemSettings.tsx`
- Add 7th tab: "Backups" with Database icon
- Render `BackupRestoreTab` component

### New Hook: `src/hooks/useBackups.ts`
- `useBackupLogs()` -- fetches backup history from `backup_logs`
- `useTriggerBackup()` -- calls `create-backup` edge function
- `useTriggerRestore()` -- calls `restore-backup` edge function
- `useAutoBackupSetting()` -- reads/writes the system setting toggle

### Modified: `DOCUMENTATION.md`
- Document the backup/restore feature, schedule, and admin UI

## File Summary

| File | Action |
|------|--------|
| `supabase/functions/create-backup/index.ts` | Create |
| `supabase/functions/restore-backup/index.ts` | Create |
| `src/components/admin/BackupRestoreTab.tsx` | Create |
| `src/hooks/useBackups.ts` | Create |
| `src/pages/admin/SystemSettings.tsx` | Modify (add tab) |
| `supabase/config.toml` | Modify (add function configs) |
| `DOCUMENTATION.md` | Update |
| Migration: `backup_logs` table + storage bucket | Create |
| Cron job SQL | Insert |

## Technical Considerations

- **Backup size**: JSON is compressed-friendly but could be large for big datasets. Edge functions have a 150s timeout, so very large databases (100k+ rows total) may need pagination within the function.
- **Restore safety**: Double confirmation required. Restore disables triggers to avoid cascading notifications during bulk insert.
- **Retention**: Backups stored indefinitely in the bucket. Future enhancement could add auto-cleanup of backups older than N days.
- **No auth.users backup**: User authentication data is managed by the platform and cannot be exported. The `profiles` table captures all user metadata.

