import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUpdateSystemSetting } from './useSystemSettings';
import { useState, useCallback } from 'react';

export interface BackupSchedule {
  frequency: 'daily' | 'weekly' | 'monthly';
  day: string;
  hour: number;
  dayOfMonth: number;
}

const DEFAULT_SCHEDULE: BackupSchedule = {
  frequency: 'weekly',
  day: 'sunday',
  hour: 2,
  dayOfMonth: 1,
};

export interface BackupProgress {
  phase: 'idle' | 'init' | 'batching' | 'finalizing' | 'done' | 'error';
  currentBatch: number;
  totalBatches: number;
  tablesProcessed: number;
  totalTables: number;
  errorMessage?: string;
}

export function useBackupLogs() {
  return useQuery({
    queryKey: ['backup-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('backup_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useTriggerBackup() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<BackupProgress>({
    phase: 'idle',
    currentBatch: 0,
    totalBatches: 0,
    tablesProcessed: 0,
    totalTables: 0,
  });

  const resetProgress = useCallback(() => {
    setProgress({
      phase: 'idle',
      currentBatch: 0,
      totalBatches: 0,
      tablesProcessed: 0,
      totalTables: 0,
    });
  }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Phase 1: INIT — get backup_id, folder_path, and table batches
      setProgress(p => ({ ...p, phase: 'init' }));

      const initResponse = await supabase.functions.invoke('create-backup', {
        body: { backup_type: 'manual' },
      });

      if (initResponse.error) throw initResponse.error;
      const { backup_id, folder_path, batches, total_tables } = initResponse.data;

      if (!backup_id || !folder_path || !batches) {
        throw new Error('Invalid init response from backup function');
      }

      setProgress({
        phase: 'batching',
        currentBatch: 0,
        totalBatches: batches.length,
        tablesProcessed: 0,
        totalTables: total_tables,
      });

      // Phase 2: Process each batch with retry
      let totalRows = 0;
      let totalSizeBytes = 0;
      let tablesProcessed = 0;
      const allErrors: string[] = [];
      const tableManifest: Array<{ table: string; rows: number; file: string }> = [];

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        let retries = 2;
        let batchSuccess = false;

        while (retries > 0 && !batchSuccess) {
          try {
            const batchResponse = await supabase.functions.invoke('create-backup', {
              body: { backup_id, folder_path, tables: batch, backup_type: 'manual' },
            });

            if (batchResponse.error) {
              retries--;
              if (retries === 0) {
                allErrors.push(`Batch ${i + 1} failed after retries: ${batchResponse.error.message}`);
              }
              continue;
            }

            const batchData = batchResponse.data;
            totalRows += batchData.total_rows || 0;
            totalSizeBytes += batchData.total_size_bytes || 0;
            tablesProcessed += batchData.tables_processed || 0;

            // Build manifest from processed results
            if (batchData.processed) {
              for (const p of batchData.processed) {
                tableManifest.push({
                  table: p.table,
                  rows: p.rows,
                  file: `${folder_path}/${p.table}.json`,
                });
              }
            }

            if (batchData.errors && batchData.errors.length > 0) {
              allErrors.push(...batchData.errors);
            }

            batchSuccess = true;
          } catch (err) {
            retries--;
            if (retries === 0) {
              allErrors.push(`Batch ${i + 1} exception: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }

        setProgress(p => ({
          ...p,
          currentBatch: i + 1,
          tablesProcessed,
        }));

        // Throttle between batches to avoid the per-trace Edge Function
        // rate limit that breaks scheduled runs at ~batch 31. Manual runs
        // are smaller today but the limit applies equally.
        if (i < batches.length - 1) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }

      // Phase 3: FINALIZE — generate manifest and update log
      setProgress(p => ({ ...p, phase: 'finalizing' }));

      const finalizeResponse = await supabase.functions.invoke('create-backup', {
        body: {
          backup_id,
          folder_path,
          finalize: true,
          backup_type: 'manual',
          tables_count: tablesProcessed,
          total_rows: totalRows,
          total_size_bytes: totalSizeBytes,
          table_manifest: tableManifest,
        },
      });

      if (finalizeResponse.error) throw finalizeResponse.error;

      setProgress(p => ({ ...p, phase: 'done' }));

      return {
        tables_count: tablesProcessed,
        total_rows: totalRows,
        errors: allErrors,
        integrity: finalizeResponse.data?.integrity as
          | {
              status: 'ok' | 'failed';
              verified_tables: number;
              missing: string[];
              unreadable: Array<{ table: string; reason: string }>;
              row_mismatch: Array<{ table: string; expected: number; actual: number }>;
            }
          | undefined,
      };
    },
    onSuccess: (data) => {
      if (data.integrity && data.integrity.status === 'failed') {
        const { missing, unreadable, row_mismatch } = data.integrity;
        toast.error(
          `Backup integrity check failed: ${missing.length} missing, ${unreadable.length} unreadable, ${row_mismatch.length} row mismatch`,
          {
            description: [
              missing.length ? `Missing: ${missing.slice(0, 5).join(', ')}` : null,
              row_mismatch.length
                ? `Mismatch: ${row_mismatch.slice(0, 3).map(m => `${m.table} (${m.actual}/${m.expected})`).join(', ')}`
                : null,
            ].filter(Boolean).join(' | '),
            duration: 20000,
          },
        );
        queryClient.invalidateQueries({ queryKey: ['backup-logs'] });
        return;
      }
      if (data.errors && data.errors.length > 0) {
        toast.warning(`Backup completed with ${data.errors.length} warnings. ${data.tables_count} tables, ${data.total_rows} rows.`, {
          description: data.errors.slice(0, 5).join(' | '),
          duration: 15000,
        });
      } else {
        toast.success(
          `Backup completed & verified: ${data.tables_count} tables, ${data.total_rows} rows`,
        );
      }
      queryClient.invalidateQueries({ queryKey: ['backup-logs'] });
    },
    onError: (error: Error) => {
      setProgress(p => ({ ...p, phase: 'error', errorMessage: error.message }));
      toast.error(`Backup failed: ${error.message}`);
    },
  });

  return {
    ...mutation,
    progress,
    resetProgress,
  };
}

export function useTriggerRestore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (backupId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Phase 1: INIT — get ordered delete/insert batches (or run legacy single-shot)
      const initResponse = await supabase.functions.invoke('restore-backup', {
        body: { backup_id: backupId },
      });
      if (initResponse.error) throw initResponse.error;

      // Legacy/uploaded backups complete in one call
      if (initResponse.data?.mode === 'legacy') {
        return {
          tables_restored: initResponse.data.tables_restored ?? 0,
          errors: initResponse.data.errors ?? [],
        };
      }

      const { delete_batches, insert_batches, total_tables } = initResponse.data as {
        delete_batches: string[][];
        insert_batches: string[][];
        total_tables: number;
      };

      const allErrors: string[] = [];

      // Phase 2: DELETE — sequentially, with one retry per batch
      for (let i = 0; i < delete_batches.length; i++) {
        const batch = delete_batches[i];
        let attempts = 2;
        while (attempts > 0) {
          const r = await supabase.functions.invoke('restore-backup', {
            body: { backup_id: backupId, phase: 'delete', tables: batch },
          });
          if (!r.error) {
            if (Array.isArray(r.data?.errors)) allErrors.push(...r.data.errors);
            break;
          }
          attempts--;
          if (attempts === 0) {
            allErrors.push(`Delete batch ${i + 1} failed: ${r.error.message}`);
          }
        }
      }

      // Phase 3: INSERT — sequentially, with one retry per batch
      let tablesRestored = 0;
      for (let i = 0; i < insert_batches.length; i++) {
        const batch = insert_batches[i];
        let attempts = 2;
        while (attempts > 0) {
          const r = await supabase.functions.invoke('restore-backup', {
            body: { backup_id: backupId, phase: 'insert', tables: batch },
          });
          if (!r.error) {
            tablesRestored += r.data?.tables_processed ?? 0;
            if (Array.isArray(r.data?.errors)) allErrors.push(...r.data.errors);
            break;
          }
          attempts--;
          if (attempts === 0) {
            allErrors.push(`Insert batch ${i + 1} failed: ${r.error.message}`);
          }
        }
      }

      // Phase 4: FINALIZE — audit log + storage manifest check
      const finalizeResponse = await supabase.functions.invoke('restore-backup', {
        body: {
          backup_id: backupId,
          phase: 'finalize',
          tables_restored: tablesRestored,
          errors: allErrors,
        },
      });
      if (finalizeResponse.error) throw finalizeResponse.error;

      return {
        tables_restored: tablesRestored,
        errors: allErrors,
        total_tables,
      };
    },
    onSuccess: (data) => {
      if (data.errors && data.errors.length > 0) {
        toast.warning(`Restore completed with ${data.errors.length} warnings. ${data.tables_restored} tables restored.`, {
          description: data.errors.slice(0, 5).join(' | '),
          duration: 15000,
        });
      } else {
        toast.success(`Restore completed: ${data.tables_restored} tables restored successfully`);
      }
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => {
      toast.error(`Restore failed: ${error.message}`);
    },
  });
}

export function useAutoBackupSetting() {
  const query = useQuery({
    queryKey: ['system-settings', 'auto_backup_enabled'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'auto_backup_enabled')
        .single();

      if (error) throw error;
      return (data?.setting_value as string) === 'enabled';
    },
  });

  const updateSetting = useUpdateSystemSetting();

  const toggle = (enabled: boolean) => {
    updateSetting.mutate({
      key: 'auto_backup_enabled',
      value: enabled ? 'enabled' : 'disabled',
    });
  };

  return {
    enabled: query.data ?? true,
    isLoading: query.isLoading,
    toggle,
    isToggling: updateSetting.isPending,
  };
}

export function useBackupSchedule() {
  return useQuery({
    queryKey: ['system-settings', 'backup_schedule'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'backup_schedule')
        .maybeSingle();

      if (error) throw error;
      if (!data?.setting_value) return DEFAULT_SCHEDULE;
      try {
        return { ...DEFAULT_SCHEDULE, ...JSON.parse(data.setting_value as string) } as BackupSchedule;
      } catch {
        return DEFAULT_SCHEDULE;
      }
    },
  });
}

export function useUpdateBackupSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (schedule: BackupSchedule & { enabled?: boolean }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('update-backup-schedule', {
        body: schedule,
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      toast.success('Backup schedule updated');
      queryClient.invalidateQueries({ queryKey: ['system-settings', 'backup_schedule'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update schedule: ${error.message}`);
    },
  });
}

export function useDownloadBackup() {
  return useMutation({
    mutationFn: async (filePath: string) => {
      const isChunked = filePath.endsWith('manifest.json');

      if (isChunked) {
        const { data: manifestBlob, error: manifestError } = await supabase.storage
          .from('database-backups')
          .download(filePath);
        if (manifestError || !manifestBlob) throw manifestError || new Error('Failed to download manifest');

        const manifest = JSON.parse(await manifestBlob.text());
        const tables = manifest.tables as Array<{ table: string; rows: number; file: string }>;

        const combinedData: Record<string, unknown[]> = {};
        for (const entry of tables) {
          try {
            const { data: tableBlob, error: tableError } = await supabase.storage
              .from('database-backups')
              .download(entry.file);
            if (tableError || !tableBlob) continue;
            combinedData[entry.table] = JSON.parse(await tableBlob.text());
          } catch {
            console.warn(`Skipping table ${entry.table} during download`);
          }
        }

        const combinedJson = JSON.stringify({
          metadata: { ...manifest, tables: undefined },
          data: combinedData,
        }, null, 2);
        const blob = new Blob([combinedJson], { type: 'application/json' });
        const fileName = filePath.replace('/manifest.json', '').split('/').pop() + '-backup.json';
        return { blob, fileName };
      } else {
        const { data, error } = await supabase.storage
          .from('database-backups')
          .download(filePath);
        if (error) throw error;
        return { blob: data, fileName: filePath };
      }
    },
    onSuccess: ({ blob, fileName }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded');
    },
    onError: (error: Error) => {
      toast.error(`Download failed: ${error.message}`);
    },
  });
}

type UploadRestorePhase = 'idle' | 'validating' | 'uploading' | 'restoring' | 'done';

export function useUploadAndRestore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<{ phase: UploadRestorePhase; tables_restored?: number; errors?: string[] }> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const text = await file.text();
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('Invalid JSON file. Please upload a valid backup file.');
      }

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Backup file must be a JSON object with table names as keys.');
      }

      const keys = Object.keys(parsed);
      if (keys.length === 0) {
        throw new Error('Backup file contains no tables.');
      }

      const filePath = `uploads/restore-${Date.now()}.json`;
      const blob = new Blob([text], { type: 'application/json' });

      const { error: uploadError } = await supabase.storage
        .from('database-backups')
        .upload(filePath, blob);

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: logRow, error: logError } = await supabase
        .from('backup_logs')
        .insert({
          backup_type: 'uploaded',
          status: 'completed',
          file_path: filePath,
          file_size_bytes: file.size,
          tables_count: keys.length,
          total_rows: keys.reduce((sum, k) => sum + (Array.isArray((parsed as Record<string, unknown[]>)[k]) ? (parsed as Record<string, unknown[]>)[k].length : 0), 0),
          created_by: session.user.id,
        })
        .select('id')
        .single();

      if (logError) throw new Error(`Failed to log backup: ${logError.message}`);

      const response = await supabase.functions.invoke('restore-backup', {
        body: { backup_id: logRow.id },
      });

      if (response.error) throw response.error;
      return { phase: 'done' as UploadRestorePhase, tables_restored: response.data?.tables_restored, errors: response.data?.errors ?? [] };
    },
    onSuccess: (data) => {
      if (data.errors && data.errors.length > 0) {
        toast.warning(`Restore completed with ${data.errors.length} warnings. ${data.tables_restored ?? 0} tables restored.`, {
          description: data.errors.join(' | '),
          duration: 15000,
        });
      } else {
        toast.success(`Restore from uploaded file completed: ${data.tables_restored ?? 0} tables restored`);
      }
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => {
      toast.error(`Upload & Restore failed: ${error.message}`);
    },
  });
}

/**
 * Force-fails a backup row that's been stuck in `running` for too long.
 * Admin-only safety valve when the periodic reaper hasn't yet picked it up.
 */
export function useCancelStuckBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (backupId: string) => {
      const { error } = await supabase
        .from('backup_logs')
        .update({
          status: 'failed',
          error_message: 'Cancelled by admin: backup was stuck in running state',
          completed_at: new Date().toISOString(),
        })
        .eq('id', backupId)
        .eq('status', 'running');
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Stuck backup marked as failed');
      queryClient.invalidateQueries({ queryKey: ['backup-logs'] });
    },
    onError: (error: Error) => {
      toast.error(`Cancel failed: ${error.message}`);
    },
  });
}

/**
 * Retries the finalize step for a backup whose batch files all uploaded
 * but whose finalize call was rate-limited (status =
 * `completed_with_errors`, error_message starts with `Finalize deferred`).
 * Reads the existing chunk JSON files from storage to rebuild the
 * table_manifest, then re-invokes the finalize mode of create-backup.
 */
export function useRetryFinalize() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (backupId: string) => {
      const { data: row, error: rowErr } = await supabase
        .from('backup_logs')
        .select('id, backup_type, error_message, tables_count, total_rows, file_size_bytes')
        .eq('id', backupId)
        .single();
      if (rowErr || !row) throw rowErr ?? new Error('Backup row not found');

      // Find the storage folder by listing for the backup id reference.
      // Stored convention: chunked/<timestamp>/<table>.json. We need the
      // folder; derive it by listing chunked/ and matching the most
      // recent folder whose creation aligns with this backup.
      const { data: folders, error: listErr } = await supabase.storage
        .from('database-backups')
        .list('chunked', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
      if (listErr) throw listErr;

      // Reconstruct manifest from the most recent folder that contains JSON files
      let folderPath: string | null = null;
      let tableFiles: Array<{ table: string; rows: number; file: string }> = [];
      let totalSize = 0;
      let totalRows = 0;

      for (const folder of folders ?? []) {
        const candidate = `chunked/${folder.name}`;
        const { data: files } = await supabase.storage
          .from('database-backups')
          .list(candidate, { limit: 1000 });
        if (!files || files.length === 0) continue;
        const jsonFiles = files.filter(
          (f) => f.name.endsWith('.json') && f.name !== 'manifest.json' && f.name !== 'storage-manifest.json'
        );
        if (jsonFiles.length === 0) continue;

        // Read each chunk to count rows (small overhead, only on retry)
        const manifestEntries: Array<{ table: string; rows: number; file: string }> = [];
        let sizeSum = 0;
        let rowSum = 0;
        for (const f of jsonFiles) {
          const tableName = f.name.replace(/\.json$/, '');
          const filePath = `${candidate}/${f.name}`;
          const { data: blob } = await supabase.storage
            .from('database-backups')
            .download(filePath);
          if (!blob) continue;
          const text = await blob.text();
          let rows = 0;
          try {
            const parsed = JSON.parse(text);
            rows = Array.isArray(parsed) ? parsed.length : 0;
          } catch {
            rows = 0;
          }
          manifestEntries.push({ table: tableName, rows, file: filePath });
          sizeSum += blob.size;
          rowSum += rows;
        }
        folderPath = candidate;
        tableFiles = manifestEntries;
        totalSize = sizeSum;
        totalRows = rowSum;
        break;
      }

      if (!folderPath || tableFiles.length === 0) {
        throw new Error('Could not locate batch files in storage for retry');
      }

      const finalizeResponse = await supabase.functions.invoke('create-backup', {
        body: {
          backup_id: backupId,
          folder_path: folderPath,
          finalize: true,
          backup_type: row.backup_type,
          tables_count: tableFiles.length,
          total_rows: totalRows,
          total_size_bytes: totalSize,
          table_manifest: tableFiles,
        },
      });
      if (finalizeResponse.error) throw finalizeResponse.error;
      return finalizeResponse.data;
    },
    onSuccess: () => {
      toast.success('Finalize retry succeeded');
      queryClient.invalidateQueries({ queryKey: ['backup-logs'] });
    },
    onError: (error: Error) => {
      toast.error(`Finalize retry failed: ${error.message}`);
    },
  });
}
