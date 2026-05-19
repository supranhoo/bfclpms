import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface SafetyDrillDelta {
  table: 'safety_incidents' | 'safety_permits' | 'safety_audit_runs';
  baseline: number;
  after: number;
  ok: boolean;
}

export interface SafetyDrillResult {
  ok: boolean;
  drill_id: string;
  backup_id: string | null;
  started_at: string;
  finished_at: string;
  baseline: Record<string, number>;
  after: Record<string, number>;
  deltas: SafetyDrillDelta[];
  errors: string[] | null;
  performed_by: string;
}

/**
 * Runs the Safety backup→restore sandbox drill. Never touches `public`.
 * Optionally accepts a real `backup_id` from `backup_logs` to verify a
 * specific create-backup artifact (Flow B in the edge function).
 */
export function useSafetyDrill() {
  const { toast } = useToast();

  return useMutation<SafetyDrillResult, Error, { backupId?: string } | void>({
    mutationFn: async (args) => {
      const backupId = (args as { backupId?: string } | undefined)?.backupId;
      const { data, error } = await supabase.functions.invoke('safety-drill', {
        body: backupId ? { backup_id: backupId } : {},
      });
      if (error) throw new Error(error.message ?? 'Drill failed');
      if (data?.error) throw new Error(String(data.error));
      return data as SafetyDrillResult;
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast({
          title: 'Safety drill passed',
          description: res.deltas
            .map((d) => `${d.table}: ${d.baseline} → ${d.after}`)
            .join(' · '),
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Safety drill detected drift',
          description:
            res.errors?.join('; ') ??
            res.deltas
              .filter((d) => !d.ok)
              .map((d) => `${d.table}: ${d.baseline} → ${d.after}`)
              .join(' · '),
        });
      }
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Safety drill failed',
        description: err.message,
      });
    },
  });
}