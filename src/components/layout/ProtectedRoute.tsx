import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

type AppRole = 'admin' | 'manager' | 'employee' | 'auditor' | 'management';

interface ProtectedRouteProps {
  allowedRoles: AppRole[];
  children: React.ReactNode;
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!role || !allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
