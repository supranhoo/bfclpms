import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaged } from '@/lib/fetchAll';
import {
  buildResolverContext,
  resolveChain,
  type ResolvedChain,
  type ResolverProfile,
} from '@/lib/workflowResolver';

export interface ResolutionRow extends ResolvedChain {}

/**
 * Fully-resolved workflow chain for every active employee for a given
 * (period, year). Period/year are passed to `get_employee_workflow_info`
 * so period-specific overrides apply.
 */
export function useWorkflowResolution(period: string, year: number) {
  return useQuery({
    queryKey: ['workflow-resolution', period, year],
    enabled: !!period && !!year,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<ResolutionRow[]> => {
      // 1. Active profiles (paged to bypass 1000-row PostgREST cap).
      const profiles = await fetchAllPaged<ResolverProfile>((from, to) =>
        supabase
          .from('profiles')
          .select(
            'id, full_name, email, employee_code, pms_grade, department_id, reporting_manager_id, functional_manager_id, is_active',
          )
          .eq('is_active', true)
          .order('full_name')
          .range(from, to),
      );

      // 2. Role rows (small table, single fetch is fine).
      const { data: roleRows, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');
      if (rolesError) throw rolesError;

      const ctx = buildResolverContext(profiles, roleRows || []);

      // 3. Resolve template per employee in batches via the canonical RPC.
      //    `get_employee_workflow_info` returns template_id, template_name,
      //    display_name, stages, config_source.
      const BATCH = 25;
      const results: ResolutionRow[] = [];
      for (let i = 0; i < profiles.length; i += BATCH) {
        const slice = profiles.slice(i, i + BATCH);
        const infos = await Promise.all(
          slice.map(async (p) => {
            const { data, error } = await supabase.rpc(
              'get_employee_workflow_info' as any,
              {
                employee_uuid: p.id,
                p_review_period: period,
                p_review_year: year,
              } as any,
            );
            if (error) throw error;
            const row = (data && (data as any[])[0]) || null;
            return { profile: p, info: row };
          }),
        );

        for (const { profile, info } of infos) {
          const chain = resolveChain(
            profile,
            {
              templateId: info?.template_id ?? null,
              templateName: info?.display_name ?? info?.template_name ?? null,
              stages: (info?.stages as string[]) ?? [],
              source: (info?.config_source as ResolvedChain['source']) ?? 'unknown',
            },
            ctx,
          );
          results.push(chain);
        }
      }

      return results;
    },
  });
}
