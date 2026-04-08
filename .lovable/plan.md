

## Revised Plan: Backup Optimization + Storage File Protection

### Current Plan (Database Tables) — Unchanged
The existing plan to fix timeouts, add 31 missing tables, and parallelize processing remains as-is.

### New Addition: Storage Bucket Protection

**Problem**: Three storage buckets contain user-uploaded files that are NOT covered by the database backup:
- `review-evidence` — KPI evidence files (critical business data)
- `avatars` — profile photos (low priority)
- `database-backups` — backup outputs (self-referential, skip)

The database only stores URLs to these files. A full restore without the files would leave broken links everywhere.

**Why we cannot back up files inside the Edge Function**: Storage files can be gigabytes total. Downloading and re-uploading them within a 150-second Edge Function is not feasible.

**Recommended approach**: Add a **Storage Manifest** to each backup that inventories all files in the critical buckets. This doesn't copy the files, but it provides a recovery checklist and detects file loss.

### Implementation

**1. Storage manifest in `create-backup`**

After backing up all tables, list all files in `review-evidence` and `avatars` buckets using `supabase.storage.from(bucket).list()`. Save the file listing (path, size, created_at) as `storage-manifest.json` alongside the table backups. This adds seconds, not minutes.

**2. Restore validation in `restore-backup`**

After restoring tables, compare evidence URLs in `review_submissions` (columns like `self_evidence_urls`, `manager_evidence_urls`) against the storage manifest. Log any missing files as warnings — the admin knows exactly which files need manual recovery.

**3. Long-term: Cross-region replication (out of scope for now)**

True file backup requires Supabase Storage replication or a scheduled external sync (e.g., S3 cross-copy). This is an infrastructure-level decision, not an app-level fix. Documenting this as a recommendation.

### Updated Files to Change

| File | Change |
|------|--------|
| `supabase/functions/create-backup/index.ts` | Add 31 missing tables, parallel batches, data pruning, error logging, **+ storage manifest generation** |
| `supabase/functions/restore-backup/index.ts` | Add 31 missing tables to DELETE/INSERT order, **+ storage manifest validation on restore** |
| `DOCUMENTATION.md` | Version bump, document backup coverage including storage manifest |

### Risk Assessment
- **Storage manifest**: Read-only operation (listing files). No writes to storage buckets. Adds ~2-5 seconds to backup time.
- **No file copying**: Files remain in their original buckets. The manifest is an inventory, not a duplicate.
- **Restore validation**: Advisory only — logs warnings but does not block restore.

### Limitation (Documented)
This approach protects against **database loss** (broken URL references) but does NOT protect against **storage bucket deletion**. For full file-level disaster recovery, cross-region storage replication would be needed — this is an infrastructure decision outside the app's scope.

