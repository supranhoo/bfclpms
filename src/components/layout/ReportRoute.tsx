import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { Loader2 } from 'lucide-react';

interface ReportRouteProps {
  reportKey: string;
  children: React.ReactNode;
}

export function ReportRoute({ reportKey, children }: ReportRouteProps) {
  const { loading } = useAuth();
  const { canView, isLoading } = useReportAccess();
  const { canAccess, isLoading: menuLoading } = useMenuAccess();

  if (loading || isLoading || menuLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Check report access OR menu access override (sidebar menuKey convention: reports-{reportKey})
  const hasAccess = canView(reportKey) || canAccess(`reports-${reportKey}`);

  if (!hasAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
