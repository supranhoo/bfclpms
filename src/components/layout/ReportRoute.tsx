import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useReportAccess } from '@/hooks/useReportAccess';
import { Loader2 } from 'lucide-react';

interface ReportRouteProps {
  reportKey: string;
  children: React.ReactNode;
}

export function ReportRoute({ reportKey, children }: ReportRouteProps) {
  const { loading } = useAuth();
  const { canView, isLoading } = useReportAccess();

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!canView(reportKey)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
