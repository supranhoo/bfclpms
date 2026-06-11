import { ReactNode } from 'react';
import { useSafetyPermissions } from '@/hooks/useSafetyPermissions';

interface PermissionGateProps {
  /** Permission key from `safety_permission_keys` (e.g. `action.incidents.delete`). */
  keyName: string;
  children: ReactNode;
  /** Render this when permission is denied. Default: nothing. */
  fallback?: ReactNode;
}

/**
 * Conditionally render children based on a Safety permission key.
 * Fail-open: while the resolver is loading or errors, children render.
 * Server-side RLS remains the source of truth.
 */
export function PermissionGate({ keyName, children, fallback = null }: PermissionGateProps) {
  const { can } = useSafetyPermissions();
  return <>{can(keyName) ? children : fallback}</>;
}