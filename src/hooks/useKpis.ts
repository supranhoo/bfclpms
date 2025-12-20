import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export type ReviewStatus = 'kra_set' | 'self_review' | 'manager_check' | 'audit' | 'approved';
export type RatingLevel = 'red' | 'yellow' | 'green' | 'blue';

export interface KPI {
  id: string;
  category_id: string;
  employee_id: string;
  kra_name: string;
  kpi_name: string;
  uom: string | null;
  criteria: string | null;
  target_value: number | null;
  weightage: number | null;
  review_period: string | null;
  review_year: number | null;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
  kra_categories?: {
    id: string;
    name: string;
    color: string;
    weightage: number;
  };
}

export interface ReviewSubmission {
  id: string;
  kpi_id: string;
  performance_review_id: string | null;
  achieved_value: number | null;
  self_rating: RatingLevel | null;
  self_score: number | null;
  self_remarks: string | null;
  self_evidence_url: string | null;
  manager_rating: RatingLevel | null;
  manager_score: number | null;
  manager_remarks: string | null;
  auditor_rating: RatingLevel | null;
  auditor_score: number | null;
  auditor_remarks: string | null;
  final_rating: RatingLevel | null;
  final_score: number | null;
}

export function useMyKpis() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-kpis', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpis')
        .select(`
          *,
          kra_categories (id, name, color, weightage)
        `)
        .eq('employee_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as KPI[];
    },
    enabled: !!user?.id,
  });
}

export function useAllKpis() {
  return useQuery({
    queryKey: ['all-kpis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpis')
        .select(`
          *,
          kra_categories (id, name, color, weightage),
          profiles:employee_id (id, full_name, email, employee_code)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useKpisByEmployee(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['kpis', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpis')
        .select(`
          *,
          kra_categories (id, name, color, weightage)
        `)
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as KPI[];
    },
    enabled: !!employeeId,
  });
}

export function useReviewSubmissions(kpiIds: string[]) {
  return useQuery({
    queryKey: ['review-submissions', kpiIds],
    queryFn: async () => {
      if (kpiIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('review_submissions')
        .select('*')
        .in('kpi_id', kpiIds);

      if (error) throw error;
      return data as ReviewSubmission[];
    },
    enabled: kpiIds.length > 0,
  });
}

export function useCreateKpi() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (kpi: Omit<KPI, 'id' | 'created_at' | 'updated_at' | 'kra_categories'>) => {
      const { data, error } = await supabase
        .from('kpis')
        .insert(kpi)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      toast({ title: 'KPI created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create KPI', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateKpi() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<KPI> & { id: string }) => {
      const { data, error } = await supabase
        .from('kpis')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      toast({ title: 'KPI updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update KPI', description: error.message, variant: 'destructive' });
    },
  });
}

export function useSubmitSelfReview() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      kpi_id,
      achieved_value,
      self_rating,
      self_score,
      self_remarks,
    }: {
      kpi_id: string;
      achieved_value: number;
      self_rating: RatingLevel;
      self_score: number;
      self_remarks: string;
    }) => {
      // First upsert the submission
      const { error: submissionError } = await supabase
        .from('review_submissions')
        .upsert({
          kpi_id,
          achieved_value,
          self_rating,
          self_score,
          self_remarks,
        }, {
          onConflict: 'kpi_id',
        });

      if (submissionError) throw submissionError;

      // Then update KPI status
      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: 'self_review' as const })
        .eq('id', kpi_id);

      if (kpiError) throw kpiError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: 'Self review submitted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to submit review', description: error.message, variant: 'destructive' });
    },
  });
}
