import { ReactNode, useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSafetyPermissions } from '@/hooks/useSafetyPermissions';
import { permissionForRoute } from '@/lib/safety/permissionKeys';

interface Props {
  children: ReactNode;
  /** Optional explicit permission key override. If omitted, derived from path. */
  keyName?: string;
}

/**
 * SafetyRouteGuard
 * ----------------
 * Wraps the *content* of a /safety/* route. Composes with the outer
 * `SafetyModuleRoute` (which gates the whole module) — this layer enforces
 * the per-page nav.* permission key.
 *
 * Fail-open while loading; denied users are redirected back to /safety with
 * a toast. Server RLS still enforces data access.
 */
export function SafetyRouteGuard({ children, keyName }: Props) {
  const { pathname } = useLocation();
  const { loading, allowed, can } = useSafetyPermissions();
  const toldRef = useRef(false);

  const resolvedKey = keyName ?? permissionForRoute(pathname);

  const denied =
    !loading && !!allowed && !!resolvedKey && !can(resolvedKey);

  useEffect(() => {
    if (denied && !toldRef.current) {
      toldRef.current = true;
      toast.error("You don't have permission to view this page.");
    }
  }, [denied]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (denied) return <Navigate to="/safety" replace />;

  return <>{children}</>;
}