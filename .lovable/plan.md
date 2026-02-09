

# Upload & Restore from External Backup File

## What This Adds
A new "Upload Backup" option in the Backups tab that lets an admin upload a previously downloaded backup JSON file and restore the database from it -- even if that backup wasn't created on this instance.

## How It Works

1. Admin clicks "Upload & Restore" button in the Backups controls card.
2. A file picker opens, accepting only `.json` files.
3. The file is validated client-side (checks for expected structure: an object with table-name keys).
4. After validation, the file is uploaded to the `database-backups` storage bucket under an `uploads/` prefix.
5. A new row is inserted into `backup_logs` with `backup_type = 'uploaded'` and the uploaded file path.
6. The existing `restore-backup` Edge Function is called with that new `backup_id` -- no changes needed to the restore function since it already reads from the storage bucket.
7. A double-confirmation dialog warns the admin before proceeding (same as current restore flow).

## Changes

### `src/hooks/useBackups.ts`
- Add `useUploadAndRestore()` mutation:
  - Reads the file, validates JSON structure
  - Uploads to `database-backups` bucket at `uploads/restore-{timestamp}.json`
  - Inserts a `backup_logs` row (type `uploaded`, status `completed`, file path)
  - Calls `restore-backup` edge function with the new backup ID
  - Returns progress/status

### `src/components/admin/BackupRestoreTab.tsx`
- Add an "Upload & Restore" button (with Upload icon) in the controls card next to "Backup Now"
- Hidden file input (`accept=".json"`) triggered by the button
- Reuse the existing confirmation dialog with adjusted messaging for uploaded files
- Show upload progress state (uploading, restoring, done)
- Badge for `uploaded` backup type in the history table

### `DOCUMENTATION.md`
- Document the upload-restore capability

## Technical Notes
- File size is limited by the browser and storage bucket (practical limit ~50 MB for JSON backups).
- The restore Edge Function requires no changes -- it already works with any `backup_logs` entry that has a valid `file_path`.
- Validation checks: file must be valid JSON, must contain an object with at least one recognized table name as a key.

