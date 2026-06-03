/**
 * Hub Platform — observe-only action guard (Phase 1).
 *
 * ALWAYS renders children. When the resolved entitlement would deny, fires a
 * background `would_deny` audit insert. Phase 5 will introduce an enforcing
 * variant; this one is intentionally permissive so PMS behavior cannot change.
 */
import { useEffect, useRef } from 'react';
import { useEntitlement, logWouldDeny } from '@/hooks/useEntitlement';
import { buildWouldDenyMetadata } from '@/lib/platformTelemetryMeta';

interface CanActionProps {
  actionKey: string;
  children: React.ReactNode;
}

export function CanAction({ actionKey, children }: CanActionProps) {
  const { hubEnabled, isActionEntitled, loading, snapshot } = useEntitlement();
  const loggedRef = useRef(false);

  useEffect(() => {
    if (loading || !hubEnabled || loggedRef.current) return;
    if (!isActionEntitled(actionKey)) {
      loggedRef.current = true;
      const hasWindow = typeof window !== 'undefined';
      const metadata = buildWouldDenyMetadata({
        actionKey,
        clientId: snapshot.clientId,
        pathname: hasWindow ? window.location.pathname : '',
        search: hasWindow ? window.location.search : '',
        source: 'CanAction',
      });
      logWouldDeny(actionKey, 'observe-mode CanAction render', metadata);
    }
  }, [loading, hubEnabled, actionKey, isActionEntitled, snapshot.clientId]);

  return <>{children}</>;
}