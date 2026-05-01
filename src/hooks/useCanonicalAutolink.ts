import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Phase 2b: Hook controlling the `enable_kpi_canonical_autolink` system
 * setting that gates the auto-link DB trigger.
 *
 * - Read is open to all authenticated users (they may need to know whether
 *   the registry is actively governing their inputs).
 * - Write requires admin role; the underlying RLS / trigger DB layer is
 *   the source of truth for enforcement.
 */

const SETTING_KEY = 'enable_kpi_canonical_autolink';

export function useCanonicalAutolinkSetting() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const fetchSetting = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', SETTING_KEY)
        .maybeSingle();
      if (error) throw error;
      // jsonb true / false stored as raw boolean
      const v = data?.setting_value;
      setEnabled(v === true || v === 'true' || (typeof v === 'string' && v === 'true'));
    } catch (err) {
      console.warn('[useCanonicalAutolinkSetting] fetch failed:', err);
      setEnabled(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSetting();
  }, [fetchSetting]);

  const setSetting = useCallback(async (next: boolean) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert(
          {
            setting_key: SETTING_KEY,
            setting_value: next as unknown as never,
            description:
              'Phase 2b: When ON, KPIs inserted/updated for May 2026+ that match a kpi_name_aliases entry are automatically stamped with their canonical kpi_definition_id.',
          } as never,
          { onConflict: 'setting_key' } as never,
        );
      if (error) throw error;
      setEnabled(next);
      toast({
        title: next ? 'Auto-link enabled' : 'Auto-link disabled',
        description: next
          ? 'New KPIs (May 2026+) will be stamped with their canonical definition automatically.'
          : 'New KPIs will save without canonical linking until re-enabled.',
      });
    } catch (err: any) {
      toast({
        title: 'Could not update setting',
        description: err?.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [toast]);

  return { enabled, loading, saving, setSetting, refetch: fetchSetting };
}

export interface PromoteSignatureResult {
  definition_id: string;
  linked_count: number;
  canonical_kra_name: string;
  canonical_kpi_name: string;
}

export function usePromoteSignature() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const promote = useCallback(async (
    categoryId: string,
    kraName: string,
    kpiName: string,
    canonicalKra?: string,
    canonicalKpi?: string,
  ): Promise<PromoteSignatureResult | null> => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('promote_signature_to_definition', {
        p_category_id: categoryId,
        p_kra_name: kraName,
        p_kpi_name: kpiName,
        p_canonical_kra: canonicalKra ?? null,
        p_canonical_kpi: canonicalKpi ?? null,
      });
      if (error) throw error;
      const result = data as PromoteSignatureResult;
      toast({
        title: 'Signature promoted',
        description: `Linked ${result.linked_count} KPI row(s) to the new canonical definition.`,
      });
      return result;
    } catch (err: any) {
      toast({
        title: 'Promotion failed',
        description: err?.message || 'Unknown error',
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return { promote, loading };
}