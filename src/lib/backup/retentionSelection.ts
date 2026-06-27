/**
 * Pure selector for backup retention sweeps.
 *
 * Given the current `backup_logs` rows and a retention policy, returns the
 * subset that should be deleted. Kept pure so it can be unit-tested without
 * any database fixture and re-implemented byte-for-byte inside the edge
 * function (Deno cannot import from `src/`).
 *
 * Rules:
 *   - `completed`: eligible when older than `keep_completed_days` AND the
 *     "always keep last N completed" floor is satisfied. The floor wins.
 *   - `completed_with_errors`: eligible when older than `keep_partial_days`.
 *   - `failed`: eligible when older than `keep_failed_days`.
 *   - `running`: never selected (owned by `reap-stuck-backups`).
 *   - `retention_sweep` summary rows: never selected (audit trail).
 */

export interface RetentionPolicy {
  enabled: boolean;
  keep_completed_days: number;
  keep_completed_min_count: number;
  keep_partial_days: number;
  keep_failed_days: number;
  dry_run: boolean;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  enabled: false,
  keep_completed_days: 30,
  keep_completed_min_count: 10,
  keep_partial_days: 14,
  keep_failed_days: 7,
  dry_run: false,
};

export interface BackupRow {
  id: string;
  status: string;
  backup_type: string | null;
  created_at: string; // ISO
  file_path: string | null;
  file_size_bytes: number | null;
}

export interface RetentionCandidate {
  id: string;
  status: string;
  created_at: string;
  file_path: string | null;
  file_size_bytes: number | null;
  reason: 'age_completed' | 'age_partial' | 'age_failed';
}

export function selectRetentionCandidates(
  rows: BackupRow[],
  policy: RetentionPolicy,
  now: Date = new Date(),
): RetentionCandidate[] {
  if (!policy.enabled) return [];

  const nowMs = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const completedCutoff = nowMs - policy.keep_completed_days * dayMs;
  const partialCutoff = nowMs - policy.keep_partial_days * dayMs;
  const failedCutoff = nowMs - policy.keep_failed_days * dayMs;

  const completed = rows
    .filter((r) => r.status === 'completed' && r.backup_type !== 'retention_sweep')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const candidates: RetentionCandidate[] = [];

  // Completed: skip the N newest, then check age cutoff on the rest.
  for (let i = 0; i < completed.length; i++) {
    if (i < policy.keep_completed_min_count) continue;
    const r = completed[i];
    if (new Date(r.created_at).getTime() < completedCutoff) {
      candidates.push({
        id: r.id,
        status: r.status,
        created_at: r.created_at,
        file_path: r.file_path,
        file_size_bytes: r.file_size_bytes,
        reason: 'age_completed',
      });
    }
  }

  for (const r of rows) {
    if (r.backup_type === 'retention_sweep') continue;
    if (r.status === 'completed_with_errors' && new Date(r.created_at).getTime() < partialCutoff) {
      candidates.push({
        id: r.id,
        status: r.status,
        created_at: r.created_at,
        file_path: r.file_path,
        file_size_bytes: r.file_size_bytes,
        reason: 'age_partial',
      });
    } else if (r.status === 'failed' && new Date(r.created_at).getTime() < failedCutoff) {
      candidates.push({
        id: r.id,
        status: r.status,
        created_at: r.created_at,
        file_path: r.file_path,
        file_size_bytes: r.file_size_bytes,
        reason: 'age_failed',
      });
    }
  }

  return candidates;
}

/**
 * Storage folder containing a backup's artifacts. Both single-file backups
 * (`folder/file.json`) and chunked backups (`folder/manifest.json` + parts)
 * live in the same parent folder, so we strip the trailing filename.
 */
export function folderForBackup(filePath: string | null): string | null {
  if (!filePath) return null;
  const idx = filePath.lastIndexOf('/');
  return idx === -1 ? null : filePath.slice(0, idx);
}