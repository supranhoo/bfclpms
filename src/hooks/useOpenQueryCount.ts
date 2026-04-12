import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useOpenQueryCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['open-query-count', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      
      const { count, error } = await supabase
        .from('kpi_queries')
        .select('*', { count: 'exact', head: true })
        .eq('raised_to', user.id)
        .eq('status', 'open')
        .eq('query_type', 'query');

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id,
    refetchInterval: 120_000, // Refresh every 120 seconds (reduced from 30s for cost optimization)
    refetchOnWindowFocus: true,
  });
}
