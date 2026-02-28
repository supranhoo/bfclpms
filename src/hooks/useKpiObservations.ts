import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export type ObservationType = 'positive' | 'concern' | 'neutral';
export type ObserverRole = 'self' | 'manager' | 'auditor' | 'management' | 'admin';

export type ObservationStatus = 'open' | 'acknowledged' | 'resolved';
export type ObservationVisibility = 'public' | 'internal';

export interface KpiObservation {
  id: string;
  kpi_id: string;
  created_by: string;
  observer_role: ObserverRole;
  observation_type: ObservationType;
  score_impact: number;
  title: string;
  description: string | null;
  evidence_url: string | null;
  evidence_urls: string[] | null;
  status: ObservationStatus;
  visibility: ObservationVisibility;
  is_applied: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  created_by_profile?: { full_name: string | null; email: string };
  reviewed_by_profile?: { full_name: string | null; email: string } | null;
  kpi?: {
    employee_id: string;
    employee_profile?: { full_name: string | null; email: string };
  };
}

export interface CreateObservationInput {
  kpi_id: string;
  observer_role: ObserverRole;
  observation_type: ObservationType;
  score_impact: number;
  title: string;
  description?: string;
  evidence_url?: string;
  is_applied?: boolean;
  visibility?: ObservationVisibility;
  mentionedUserIds?: string[];
}

export interface UpdateObservationInput {
  id: string;
  observation_type?: ObservationType;
  score_impact?: number;
  title?: string;
  description?: string;
  evidence_url?: string;
  is_applied?: boolean;
  reviewed_by?: string;
  reviewed_at?: string;
  visibility?: ObservationVisibility;
}

// Fetch observations for a single KPI
export function useKpiObservations(kpiId: string | undefined) {
  return useQuery({
    queryKey: ['kpi-observations', kpiId],
    queryFn: async () => {
      if (!kpiId) return [];
      
      const { data, error } = await supabase
        .from('kpi_observations')
        .select(`
          *,
          created_by_profile:profiles!kpi_observations_created_by_fkey(full_name, email),
          reviewed_by_profile:profiles!kpi_observations_reviewed_by_fkey(full_name, email)
        `)
        .eq('kpi_id', kpiId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as KpiObservation[];
    },
    enabled: !!kpiId,
  });
}

// Fetch observations for multiple KPIs
export function useObservationsByKpis(kpiIds: string[]) {
  return useQuery({
    queryKey: ['kpi-observations-batch', kpiIds],
    queryFn: async () => {
      if (!kpiIds.length) return new Map<string, KpiObservation[]>();
      
      const { data, error } = await supabase
        .from('kpi_observations')
        .select(`
          *,
          created_by_profile:profiles!kpi_observations_created_by_fkey(full_name, email),
          reviewed_by_profile:profiles!kpi_observations_reviewed_by_fkey(full_name, email),
          kpi:kpis!kpi_observations_kpi_id_fkey(employee_id, employee_profile:profiles!kpis_employee_id_fkey(full_name, email))
        `)
        .in('kpi_id', kpiIds)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Group by kpi_id
      const observationMap = new Map<string, KpiObservation[]>();
      (data as KpiObservation[]).forEach(obs => {
        const existing = observationMap.get(obs.kpi_id) || [];
        existing.push(obs);
        observationMap.set(obs.kpi_id, existing);
      });
      
      return observationMap;
    },
    enabled: kpiIds.length > 0,
  });
}

// Create a new observation
export function useCreateObservation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: CreateObservationInput) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { mentionedUserIds, ...insertData } = input;
      
      const { data, error } = await supabase
        .from('kpi_observations')
        .insert({
          ...insertData,
          created_by: userData.user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Insert @mention notifications
      if (mentionedUserIds && mentionedUserIds.length > 0) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', userData.user.id)
          .single();

        const mentionerName = profile?.full_name || profile?.email || 'Someone';

        const { data: kpiData } = await supabase
          .from('kpis')
          .select('employee_id, kpi_name')
          .eq('id', input.kpi_id)
          .single();

        const uniqueIds = [...new Set(mentionedUserIds)].filter(id => id !== userData.user.id);

        if (uniqueIds.length > 0) {
          const notifications = uniqueIds.map(userId => ({
            user_id: userId,
            type: 'observation_mention',
            title: '@Mentioned in Observation',
            message: `${mentionerName} mentioned you in observation "${input.title}" on ${kpiData?.kpi_name || 'a KPI'}`,
            kpi_id: input.kpi_id,
            related_user_id: userData.user.id,
            metadata: {
              employee_id: kpiData?.employee_id || null,
              observation_id: data.id,
              observation_title: input.title,
              observation_type: input.observation_type,
              observation_description: input.description || null,
            },
          }));

          await supabase.from('notifications').insert(notifications);

            // Grant mentioned users read-only access to this KPI
            await supabase.from('kpi_mention_access').upsert(
              uniqueIds.map(userId => ({
                kpi_id: input.kpi_id,
                user_id: userId,
                granted_by: userData.user.id,
              })),
              { onConflict: 'kpi_id,user_id', ignoreDuplicates: true }
            );
        }
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['kpi-observations', data.kpi_id] });
      queryClient.invalidateQueries({ queryKey: ['kpi-observations-batch'] });
      toast({
        title: 'Observation Added',
        description: 'Your observation has been recorded.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Update an observation
export function useUpdateObservation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: UpdateObservationInput) => {
      const { id, ...updates } = input;
      
      const { data, error } = await supabase
        .from('kpi_observations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['kpi-observations', data.kpi_id] });
      queryClient.invalidateQueries({ queryKey: ['kpi-observations-batch'] });
      toast({
        title: 'Observation Updated',
        description: 'The observation has been updated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Delete an observation
export function useDeleteObservation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, kpiId }: { id: string; kpiId: string }) => {
      const { error } = await supabase
        .from('kpi_observations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { id, kpiId };
    },
    onSuccess: ({ kpiId }) => {
      queryClient.invalidateQueries({ queryKey: ['kpi-observations', kpiId] });
      queryClient.invalidateQueries({ queryKey: ['kpi-observations-batch'] });
      toast({
        title: 'Observation Deleted',
        description: 'The observation has been removed.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Toggle is_applied status (for Management/Admin) - kept for backward compatibility
export function useApplyObservationImpact() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, isApplied, kpiId }: { id: string; isApplied: boolean; kpiId: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('kpi_observations')
        .update({
          is_applied: isApplied,
          reviewed_by: isApplied ? userData.user.id : null,
          reviewed_at: isApplied ? new Date().toISOString() : null,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return { ...data, kpiId };
    },
    onSuccess: ({ kpiId }) => {
      queryClient.invalidateQueries({ queryKey: ['kpi-observations', kpiId] });
      queryClient.invalidateQueries({ queryKey: ['kpi-observations-batch'] });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
