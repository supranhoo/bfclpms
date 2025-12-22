import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addMonths } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export type ReviewStatus = 'kra_set' | 'self_review' | 'manager_check' | 'audit' | 'approved';
export type RatingLevel = 'red' | 'yellow' | 'green' | 'blue';
export type KpiStatus = 'open' | 'submitted' | 'approved_by_manager' | 'locked';
export type QueryStatus = 'open' | 'resolved';

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
  // Rating thresholds
  r5: string | null;
  r4: string | null;
  r3: string | null;
  r2: string | null;
  r1: string | null;
  r0: string | null;
  frequency: string | null;
  source_of_data: string | null;
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
  kpi_status: KpiStatus;
}

export interface KpiQuery {
  id: string;
  kpi_id: string;
  entity_type: 'kra' | 'kpi';
  raised_by: string;
  raised_to: string;
  reason: string;
  evidence_url: string | null;
  resolution_notes: string | null;
  status: QueryStatus;
  created_at: string;
  resolved_at: string | null;
  updated_at: string;
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
      // Fetch all KPIs by paginating through results (Supabase default limit is 1000)
      const allKpis: any[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('kpis')
          .select(`
            *,
            kra_categories (id, name, color, weightage),
            profiles:employee_id (id, full_name, email, employee_code)
          `)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allKpis.push(...data);
          from += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      return allKpis;
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
      
      // Batch kpiIds to avoid hitting query limits (max ~100 items per IN clause is safe)
      const batchSize = 100;
      const allSubmissions: ReviewSubmission[] = [];
      
      for (let i = 0; i < kpiIds.length; i += batchSize) {
        const batch = kpiIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('review_submissions')
          .select('*')
          .in('kpi_id', batch);

        if (error) throw error;
        if (data) allSubmissions.push(...(data as ReviewSubmission[]));
      }
      
      return allSubmissions;
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
      self_evidence_url,
    }: {
      kpi_id: string;
      achieved_value: number;
      self_rating: RatingLevel;
      self_score: number;
      self_remarks: string;
      self_evidence_url?: string | null;
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
          self_evidence_url,
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

// Hook for rolling over KPIs to next month/period
export function useRolloverKpi() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ kpi, targetPeriod }: { kpi: KPI; targetPeriod: string }) => {
      // Calculate the next year if rolling to a new year
      const currentPeriod = kpi.review_period || '';
      const currentYear = kpi.review_year || new Date().getFullYear();
      
      // Determine the target year
      let targetYear = currentYear;
      const periodMonths: Record<string, number> = {
        'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
        'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11,
        'Q1': 0, 'Q2': 3, 'Q3': 6, 'Q4': 9
      };
      
      // If current period is December and target is January, increment year
      if (currentPeriod === 'December' && targetPeriod === 'January') {
        targetYear = currentYear + 1;
      }
      
      // If current quarter is Q4 and target is Q1, increment year
      if (currentPeriod === 'Q4' && targetPeriod === 'Q1') {
        targetYear = currentYear + 1;
      }

      const { data, error } = await supabase
        .from('kpis')
        .insert({
          employee_id: kpi.employee_id,
          category_id: kpi.category_id,
          kra_name: kpi.kra_name,
          kpi_name: kpi.kpi_name,
          target_value: kpi.target_value,
          weightage: kpi.weightage,
          uom: kpi.uom,
          frequency: kpi.frequency,
          criteria: kpi.criteria,
          source_of_data: kpi.source_of_data,
          r0: kpi.r0,
          r1: kpi.r1,
          r2: kpi.r2,
          r3: kpi.r3,
          r4: kpi.r4,
          r5: kpi.r5,
          review_period: targetPeriod,
          review_year: targetYear,
          status: 'kra_set',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      toast({ title: 'KPI rolled over successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to rollover KPI', description: error.message, variant: 'destructive' });
    },
  });
}

// Hook for approving a single KPI (manager level)
export function useApproveKpi() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      kpi_id,
      manager_rating,
      manager_score,
      manager_remarks,
    }: {
      kpi_id: string;
      manager_rating: RatingLevel;
      manager_score: number;
      manager_remarks: string;
    }) => {
      // Update submission with manager rating and set kpi_status to approved_by_manager
      const { error: submissionError } = await supabase
        .from('review_submissions')
        .update({
          manager_rating,
          manager_score,
          manager_remarks,
          kpi_status: 'approved_by_manager' as const,
        })
        .eq('kpi_id', kpi_id);

      if (submissionError) throw submissionError;

      // Log the approval action
      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id,
          action: 'MANAGER_APPROVED',
          performed_by: user.id,
          new_value: { manager_rating, manager_score, manager_remarks },
          metadata: { approved_at: new Date().toISOString() },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: 'KPI approved successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to approve KPI', description: error.message, variant: 'destructive' });
    },
  });
}

// Hook for raising a query on a KPI
export function useRaiseQuery() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      kpi_id,
      raised_to,
      reason,
      entity_type = 'kpi',
    }: {
      kpi_id: string;
      raised_to: string;
      reason: string;
      entity_type?: 'kra' | 'kpi';
    }) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('kpi_queries')
        .insert({
          kpi_id,
          raised_by: user.id,
          raised_to,
          reason,
          entity_type,
          status: 'open',
        })
        .select()
        .single();

      if (error) throw error;

      // Log the query action
      await supabase.from('kpi_audit_logs').insert({
        kpi_id,
        action: 'QUERY_RAISED',
        performed_by: user.id,
        new_value: { reason, raised_to },
        metadata: { query_id: data.id },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-queries'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: 'Query raised successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to raise query', description: error.message, variant: 'destructive' });
    },
  });
}

// Hook for resolving a query
export function useResolveQuery() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      query_id,
      resolution_notes,
    }: {
      query_id: string;
      resolution_notes: string;
    }) => {
      const { error } = await supabase
        .from('kpi_queries')
        .update({
          status: 'resolved' as const,
          resolution_notes,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', query_id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-queries'] });
      toast({ title: 'Query resolved successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to resolve query', description: error.message, variant: 'destructive' });
    },
  });
}

// Hook to fetch queries for KPIs
export function useKpiQueries(kpiIds: string[]) {
  return useQuery({
    queryKey: ['kpi-queries', kpiIds],
    queryFn: async () => {
      if (kpiIds.length === 0) return [];
      
      // Batch kpiIds to avoid hitting query limits
      const batchSize = 100;
      const allQueries: any[] = [];
      
      for (let i = 0; i < kpiIds.length; i += batchSize) {
        const batch = kpiIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('kpi_queries')
          .select(`
            *,
            raised_by_profile:raised_by(id, full_name, email),
            raised_to_profile:raised_to(id, full_name, email)
          `)
          .in('kpi_id', batch)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (data) allQueries.push(...data);
      }
      
      // Sort all results by created_at descending
      return allQueries.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    enabled: kpiIds.length > 0,
  });
}
