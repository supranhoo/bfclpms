/** ADR-339 — React Query layer for saved tiered option templates. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  TieredTemplate,
  listTieredTemplates,
  saveTieredTemplate,
  deactivateTieredTemplate,
} from '@/services/kpi/tieredTemplateService';
import type { QualitativeOption } from '@/lib/qualitativeUom';

const KEY = ['kpi-tiered-templates'];

export function useTieredTemplates() {
  return useQuery<TieredTemplate[]>({
    queryKey: KEY,
    staleTime: 5 * 60_000,
    queryFn: listTieredTemplates,
  });
}

export function useSaveTieredTemplate() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { id?: string | null; name: string; description?: string | null; options: QualitativeOption[] }
  >({
    mutationFn: saveTieredTemplate,
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success(vars.id ? 'Template updated.' : 'Template saved.');
    },
    onError: (e) => toast.error(e?.message ?? 'Could not save the template.'),
  });
}

export function useDeleteTieredTemplate() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deactivateTieredTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success('Template removed.');
    },
    onError: (e) => toast.error(e?.message ?? 'Could not remove the template.'),
  });
}
