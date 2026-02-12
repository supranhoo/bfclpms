import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Module {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  route: string;
  is_enabled: boolean;
  display_order: number;
  created_at: string;
}

export function useModules() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['modules'],
    queryFn: async (): Promise<Module[]> => {
      const { data, error } = await supabase
        .from('modules')
        .select('*')
        .eq('is_enabled', true)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error fetching modules:', error);
        throw error;
      }

      return (data || []) as Module[];
    },
    enabled: !!user, // Only fetch when authenticated to avoid RLS empty-result caching
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}
