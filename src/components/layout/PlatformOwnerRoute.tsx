import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEntitlement } from '@/hooks/useEntitlement';
import { Loader2 } from 'lucide-react';

/**
 * Hub-level guard. Requires `platform_owner` role AND the
 * `hub_platform_settings_enabled` master switch to be ON.
 * When either is missing, returns 404 (Navigate to /home).
 */
export function PlatformOwnerRoute({ children }: { children: React.ReactNode }) {
  const { hasRole, loading } = useAuth();
  const { hubEnabled, loading: entLoading } = useEntitlement();

  if (loading || entLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hubEnabled || !hasRole('platform_owner')) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
}