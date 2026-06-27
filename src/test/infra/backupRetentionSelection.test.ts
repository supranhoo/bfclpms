import { describe, it, expect } from 'vitest';
import {
  selectRetentionCandidates,
  folderForBackup,
  DEFAULT_RETENTION_POLICY,
  type BackupRow,
  type RetentionPolicy,
} from '@/lib/backup/retentionSelection';

const NOW = new Date('2026-06-27T00:00:00Z');
const dayAgo = (d: number) =>
  new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

function row(over: Partial<BackupRow>): BackupRow {
  return {
    id: crypto.randomUUID(),
    status: 'completed',
    backup_type: 'scheduled',
    created_at: NOW.toISOString(),
    file_path: 'backups/2026-06-27/manifest.json',
    file_size_bytes: 1000,
    ...over,
  };
}

const ENABLED: RetentionPolicy = { ...DEFAULT_RETENTION_POLICY, enabled: true };

describe('selectRetentionCandidates', () => {
  it('returns nothing when policy is disabled', () => {
    const rows = [row({ created_at: dayAgo(365), status: 'failed' })];
    expect(selectRetentionCandidates(rows, DEFAULT_RETENTION_POLICY, NOW)).toEqual([]);
  });

  it('honors the keep-N-completed floor over the age cutoff', () => {
    const rows: BackupRow[] = Array.from({ length: 15 }, (_, i) =>
      row({ status: 'completed', created_at: dayAgo(60 + i) }),
    );
    const out = selectRetentionCandidates(rows, ENABLED, NOW);
    // 15 completed rows, all older than 30d, floor=10 → exactly 5 candidates.
    expect(out).toHaveLength(5);
    expect(out.every((c) => c.reason === 'age_completed')).toBe(true);
  });

  it('keeps completed rows that are inside the age window', () => {
    const rows = [
      row({ status: 'completed', created_at: dayAgo(10) }),
      row({ status: 'completed', created_at: dayAgo(20) }),
      row({ status: 'completed', created_at: dayAgo(100) }),
    ];
    // floor=10 → none deleted
    expect(selectRetentionCandidates(rows, ENABLED, NOW)).toEqual([]);
    // with a lower floor, the 100-day-old row is eligible
    const out = selectRetentionCandidates(rows, { ...ENABLED, keep_completed_min_count: 2 }, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].reason).toBe('age_completed');
  });

  it('selects partial backups past keep_partial_days', () => {
    const rows = [
      row({ status: 'completed_with_errors', created_at: dayAgo(20) }),
      row({ status: 'completed_with_errors', created_at: dayAgo(5) }),
    ];
    const out = selectRetentionCandidates(rows, ENABLED, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].reason).toBe('age_partial');
  });

  it('selects failed backups past keep_failed_days', () => {
    const rows = [
      row({ status: 'failed', created_at: dayAgo(2) }),
      row({ status: 'failed', created_at: dayAgo(30) }),
    ];
    const out = selectRetentionCandidates(rows, ENABLED, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].reason).toBe('age_failed');
  });

  it('never selects running rows', () => {
    const rows = [row({ status: 'running', created_at: dayAgo(365) })];
    expect(selectRetentionCandidates(rows, ENABLED, NOW)).toEqual([]);
  });

  it('never selects retention_sweep audit rows', () => {
    const rows = [
      row({ status: 'completed', backup_type: 'retention_sweep', created_at: dayAgo(365) }),
      row({ status: 'failed', backup_type: 'retention_sweep', created_at: dayAgo(365) }),
    ];
    expect(selectRetentionCandidates(rows, ENABLED, NOW)).toEqual([]);
  });
});

describe('folderForBackup', () => {
  it('returns parent folder', () => {
    expect(folderForBackup('backups/2026-06-27/manifest.json')).toBe('backups/2026-06-27');
    expect(folderForBackup('backups/2026-06-27/db.json')).toBe('backups/2026-06-27');
  });
  it('handles null/no-slash gracefully', () => {
    expect(folderForBackup(null)).toBeNull();
    expect(folderForBackup('toplevel.json')).toBeNull();
  });
});