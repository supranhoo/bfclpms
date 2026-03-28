import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { Loader2 } from 'lucide-react';
// NOTE: AppRole is the single source of truth — update src/lib/roles.ts when adding roles.
import type { AppRole } from '@/lib/roles';

interface ProtectedRouteProps {
  allowedRoles: AppRole[];
  menuKey?: string;
  children: React.ReactNode;
}

export function ProtectedRoute({ allowedRoles, menuKey, children }: ProtectedRouteProps) {
  const { effectiveRole, loading } = useAuth();
  const { canAccess } = useMenuAccess();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If menuKey provided and user has override access, allow through
  if (menuKey && canAccess(menuKey)) {
    return <>{children}</>;
  }

  if (!effectiveRole || !allowedRoles.includes(effectiveRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
