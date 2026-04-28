import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAnyOrgKpiDataOwner } from '@/hooks/useOrgKpiDataOwner';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { Loader2 } from 'lucide-react';

interface DataOwnerRouteProps {
  children: React.ReactNode;
}

const DATA_ENTRY_MENU_KEY = 'data-entry';

/**
 * Route guard for /admin/org-kpi-data.
 *
 * Admit policy (must mirror the AppSidebar Data Entry filter — see BUG-040 / BUG-041):
 *   1. effectiveRole === 'admin'
 *   2. user is an org KPI data owner (useIsAnyOrgKpiDataOwner)
 *   3. user has an explicit per-user override on the 'data-entry' menu key
 *   4. user has profile-based view rights on 'data-entry'
 *
 * Role-default access is intentionally NOT sufficient — see POLICY.md §111.
 */
export function DataOwnerRoute({ children }: DataOwnerRouteProps) {
  const { user, effectiveRole, loading: authLoading } = useAuth();
  const { data: isDataOwner, isLoading: ownerLoading } = useIsAnyOrgKpiDataOwner();
  const { userOverrides, canPerform, isLoading: menuLoading } = useMenuAccess();

  if (authLoading || ownerLoading || menuLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // 1. Admin always has access
  if (effectiveRole === 'admin') return <>{children}</>;

  // 2. Designated data owners have access
  if (isDataOwner) return <>{children}</>;

  // 3. Per-user explicit override granted by an admin
  const hasUserOverride = !!user?.id && userOverrides.some(
    (o) => o.menu_key === DATA_ENTRY_MENU_KEY && o.user_id === user.id
  );
  if (hasUserOverride) return <>{children}</>;

  // 4. Profile-based view right
  if (canPerform(DATA_ENTRY_MENU_KEY, 'view')) return <>{children}</>;

  return <Navigate to="/dashboard" replace />;
}

