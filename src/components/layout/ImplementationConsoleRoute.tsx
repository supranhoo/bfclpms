import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

/**
 * Implementation Console guard.
 * Allows `platform_owner` OR any user with ≥1 row in
 * `client_implementer_assignments`. RLS makes the row visible only
 * to the user themselves, so a simple count is safe.
 */
export function ImplementationConsoleRoute({ children }: { children: React.ReactNode }) {
  const { user, hasRole, loading } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['impl-console', 'access', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('client_implementer_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isOwner = hasRole('platform_owner');
  const isAssigned = (data ?? 0) > 0;
  if (!isOwner && !isAssigned) return <Navigate to="/home" replace />;
  return <>{children}</>;
}