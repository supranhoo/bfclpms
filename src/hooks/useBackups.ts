import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUpdateSystemSetting } from './useSystemSettings';

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

  return useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('create-backup', {
        body: { backup_type: 'manual' },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Backup completed: ${data.tables_count} tables, ${data.total_rows} rows`);
      queryClient.invalidateQueries({ queryKey: ['backup-logs'] });
    },
    onError: (error: Error) => {
      toast.error(`Backup failed: ${error.message}`);
    },
  });
}

export function useTriggerRestore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (backupId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('restore-backup', {
        body: { backup_id: backupId },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      if (data.errors && data.errors.length > 0) {
        toast.warning(`Restore completed with ${data.errors.length} warnings. ${data.tables_restored} tables restored.`);
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

export function useDownloadBackup() {
  return useMutation({
    mutationFn: async (filePath: string) => {
      const { data, error } = await supabase.storage
        .from('database-backups')
        .download(filePath);

      if (error) throw error;
      return { blob: data, fileName: filePath };
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
    mutationFn: async (file: File): Promise<{ phase: UploadRestorePhase; tables_restored?: number }> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // 1. Read and validate JSON
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

      // 2. Upload to storage
      const filePath = `uploads/restore-${Date.now()}.json`;
      const blob = new Blob([text], { type: 'application/json' });

      const { error: uploadError } = await supabase.storage
        .from('database-backups')
        .upload(filePath, blob);

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      // 3. Insert backup_logs row
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

      // 4. Call restore edge function
      const response = await supabase.functions.invoke('restore-backup', {
        body: { backup_id: logRow.id },
      });

      if (response.error) throw response.error;
      return { phase: 'done' as UploadRestorePhase, tables_restored: response.data?.tables_restored };
    },
    onSuccess: (data) => {
      toast.success(`Restore from uploaded file completed: ${data.tables_restored ?? 0} tables restored`);
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => {
      toast.error(`Upload & Restore failed: ${error.message}`);
    },
  });
}
