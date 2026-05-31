import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface IncrementSlabRow {
  id: string;
  assessment_year: string;
  increment_period: string | null;
  rating_from: number;
  rating_to: number;
  increment_percent: number;
  prorate_on_doj: boolean;
  company_ids: string[];
  division_ids: string[];
  business_unit_ids: string[];
  location_ids: string[];
  category_ids: string[];
  level_ids: string[];
  extra_attributes: Record<string, any>;
  sort_order: number;
  status: 'active' | 'archived';
  version: number;
  created_at: string;
  updated_at: string;
}

export function useIncrementSlabs(assessmentYear: string | null) {
  return useQuery({
    queryKey: ['increment-slabs', assessmentYear],
    enabled: !!assessmentYear,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('increment_slabs' as any)
        .select('*')
        .eq('assessment_year', assessmentYear!)
        .eq('status', 'active')
        .order('sort_order', { ascending: true })
        .order('rating_from', { ascending: false });
      if (error) throw error;
      return (data as unknown as IncrementSlabRow[]) ?? [];
    },
  });
}

export function useUpsertSlab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (slab: Partial<IncrementSlabRow> & { assessment_year: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const payload = { ...slab, created_by: userData?.user?.id ?? null } as any;
      if (slab.id) {
        const { data, error } = await supabase
          .from('increment_slabs' as any)
          .update(payload)
          .eq('id', slab.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('increment_slabs' as any)
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['increment-slabs', vars.assessment_year] });
      toast({ title: 'Saved', description: 'Slab saved.' });
    },
    onError: (e: any) =>
      toast({ title: 'Save failed', description: e?.message ?? 'Unknown error', variant: 'destructive' }),
  });
}

export function useDeleteSlab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id }: { id: string; assessment_year: string }) => {
      const { error } = await supabase.from('increment_slabs' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['increment-slabs', vars.assessment_year] });
      toast({ title: 'Deleted', description: 'Slab removed.' });
    },
    onError: (e: any) =>
      toast({ title: 'Delete failed', description: e?.message ?? 'Unknown error', variant: 'destructive' }),
  });
}

export function useCopyPreviousYearSlabs() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ fromYear, toYear }: { fromYear: string; toYear: string }) => {
      const { data: src, error } = await supabase
        .from('increment_slabs' as any)
        .select('*')
        .eq('assessment_year', fromYear)
        .eq('status', 'active');
      if (error) throw error;
      if (!src || src.length === 0) return 0;
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? null;
      const rows = (src as any[]).map((s) => ({
        assessment_year: toYear,
        increment_period: s.increment_period,
        rating_from: s.rating_from,
        rating_to: s.rating_to,
        increment_percent: s.increment_percent,
        prorate_on_doj: s.prorate_on_doj,
        company_ids: s.company_ids,
        division_ids: s.division_ids,
        business_unit_ids: s.business_unit_ids,
        location_ids: s.location_ids,
        category_ids: s.category_ids,
        level_ids: s.level_ids,
        extra_attributes: s.extra_attributes,
        sort_order: s.sort_order,
        status: 'active',
        version: 1,
        created_by: uid,
      }));
      const { error: insErr } = await supabase.from('increment_slabs' as any).insert(rows);
      if (insErr) throw insErr;
      return rows.length;
    },
    onSuccess: (count, vars) => {
      qc.invalidateQueries({ queryKey: ['increment-slabs', vars.toYear] });
      toast({ title: 'Copied', description: `${count} slabs copied from ${vars.fromYear}.` });
    },
    onError: (e: any) =>
      toast({ title: 'Copy failed', description: e?.message ?? 'Unknown error', variant: 'destructive' }),
  });
}