/**
 * Hub Platform — observe-only action guard (Phase 1).
 *
 * ALWAYS renders children. When the resolved entitlement would deny, fires a
 * background `would_deny` audit insert. Phase 5 will introduce an enforcing
 * variant; this one is intentionally permissive so PMS behavior cannot change.
 */
import { useEffect, useRef } from 'react';
import { useEntitlement, logWouldDeny } from '@/hooks/useEntitlement';

interface CanActionProps {
  actionKey: string;
  children: React.ReactNode;
}

export function CanAction({ actionKey, children }: CanActionProps) {
  const { hubEnabled, isActionEntitled, loading } = useEntitlement();
  const loggedRef = useRef(false);

  useEffect(() => {
    if (loading || !hubEnabled || loggedRef.current) return;
    if (!isActionEntitled(actionKey)) {
      loggedRef.current = true;
      logWouldDeny(actionKey, 'observe-mode CanAction render');
    }
  }, [loading, hubEnabled, actionKey, isActionEntitled]);

  return <>{children}</>;
}