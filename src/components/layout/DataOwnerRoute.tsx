import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAnyOrgKpiDataOwner } from '@/hooks/useOrgKpiDataOwner';
import { Loader2 } from 'lucide-react';

interface DataOwnerRouteProps {
  children: React.ReactNode;
}

/**
 * Route guard that allows access to admins and users assigned as data owners
 */
export function DataOwnerRoute({ children }: DataOwnerRouteProps) {
  const { role, loading: authLoading } = useAuth();
  const { data: isDataOwner, isLoading: ownerLoading } = useIsAnyOrgKpiDataOwner();

  if (authLoading || ownerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Admin always has access
  if (role === 'admin') {
    return <>{children}</>;
  }

  // Data owners have access
  if (isDataOwner) {
    return <>{children}</>;
  }

  // Otherwise redirect to dashboard
  return <Navigate to="/dashboard" replace />;
}

