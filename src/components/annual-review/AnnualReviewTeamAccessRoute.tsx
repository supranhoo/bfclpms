import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDirectoryAccess } from '@/hooks/useDirectoryAccess';
import { annualReviewTeamAccessAllowed } from '@/lib/annualReview/teamAccess';

interface AnnualReviewTeamAccessRouteProps {
  children: React.ReactNode;
}

/**
 * Route guard for Annual Review team assistance. Static reviewer/admin roles
 * still pass immediately; HR-Team / BU / HOD access is resolved by the same
 * backend directory resolver that gates search + create.
 */
export function AnnualReviewTeamAccessRoute({ children }: AnnualReviewTeamAccessRouteProps) {
  const { effectiveRole, loading } = useAuth();
  const directoryAccess = useDirectoryAccess();
  const staticOrResolved = annualReviewTeamAccessAllowed(
    effectiveRole,
    directoryAccess.canAccess,
  );

  if (loading || (!staticOrResolved && directoryAccess.isLoading)) {
    return (
      <div className="min-h-[200px] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!staticOrResolved) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}