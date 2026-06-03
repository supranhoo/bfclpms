/**
 * Hub Platform — observe-only action guard (Phase 1).
 *
 * ALWAYS renders children. When the resolved entitlement would deny, fires a
 * background `would_deny` audit insert. Phase 5 will introduce an enforcing
 * variant; this one is intentionally permissive so PMS behavior cannot change.
 */
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useEntitlement, logWouldDeny, logDeny, useEnforcementPilot } from '@/hooks/useEntitlement';
import { buildWouldDenyMetadata } from '@/lib/platformTelemetryMeta';
import { shouldBlock, isEnforceable, BLOCK_MSG } from '@/lib/platformEnforcement';

interface CanActionProps {
  actionKey: string;
  children: React.ReactNode;
}

export function CanAction({ actionKey, children }: CanActionProps) {
  const { hubEnabled, isActionEntitled, loading, snapshot } = useEntitlement();
  const { pilotEnabled, loading: pilotLoading } = useEnforcementPilot();
  const loggedRef = useRef(false);
  const deniedLoggedRef = useRef(false);

  const entitled = !loading && hubEnabled ? isActionEntitled(actionKey) : true;
  const blocked =
    !loading &&
    !pilotLoading &&
    shouldBlock({ hubEnabled, pilotEnabled, actionKey, entitled });

  useEffect(() => {
    if (loading || !hubEnabled || loggedRef.current || blocked) return;
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
  }, [loading, hubEnabled, actionKey, isActionEntitled, snapshot.clientId, blocked]);

  useEffect(() => {
    if (!blocked || deniedLoggedRef.current) return;
    deniedLoggedRef.current = true;
    const hasWindow = typeof window !== 'undefined';
    const metadata = {
      ...buildWouldDenyMetadata({
        actionKey,
        clientId: snapshot.clientId,
        pathname: hasWindow ? window.location.pathname : '',
        search: hasWindow ? window.location.search : '',
        source: 'CanAction',
      }),
      mode: 'enforced',
    };
    logDeny(actionKey, 'enforced CanAction render', metadata);
  }, [blocked, actionKey, snapshot.clientId]);

  if (blocked && isEnforceable(actionKey)) {
    return (
      <span className="relative inline-block" title={BLOCK_MSG}>
        <span aria-disabled="true" className="opacity-60 pointer-events-none">
          {children}
        </span>
        <button
          type="button"
          aria-label={BLOCK_MSG}
          className="absolute inset-0 w-full h-full cursor-not-allowed bg-transparent"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toast.error(BLOCK_MSG);
          }}
        />
      </span>
    );
  }

  return <>{children}</>;
}