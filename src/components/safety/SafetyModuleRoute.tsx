import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

/**
 * SafetyModuleRoute
 * -----------------
 * Guards every /safety/* route. Two checks:
 *   1. modules.is_enabled = true for code='safety' (global kill switch)
 *   2. has_safety_module_access(uid) RPC (per-user grant; admins auto-pass)
 *
 * Either failure → redirect to /home so the user lands on the Hub instead
 * of being stuck on a forbidden page.
 */
export function SafetyModuleRoute({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!user) {
      setChecking(false);
      setAllowed(false);
      return;
    }

    (async () => {
      try {
        const [{ data: moduleRow }, { data: hasAccess }] = await Promise.all([
          supabase.from('modules').select('is_enabled').eq('code', 'safety').maybeSingle(),
          supabase.rpc('has_safety_module_access', { _user_id: user.id }),
        ]);
        if (cancelled) return;
        setAllowed(Boolean(moduleRow?.is_enabled) && Boolean(hasAccess));
      } catch (err) {
        console.error('SafetyModuleRoute access check failed:', err);
        if (!cancelled) setAllowed(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading]);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-destructive" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!allowed) return <Navigate to="/home" replace />;
  return <>{children}</>;
}