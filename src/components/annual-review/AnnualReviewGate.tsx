import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAnnualReviewFlag, useActiveCycle, useMyInstance } from '@/hooks/useAnnualReview';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Route-level guard for /annual-review/* routes.
 *
 * Delegates to `is_feature_flag_enabled_for_me('annual_review_enabled')` via
 * `useAnnualReviewFlag`. Sidebar hiding alone is insufficient — an authorised
 * role could otherwise deep-link into the module during the pilot. Admins
 * bypass automatically because the RPC returns true for admins regardless of
 * `target_user_ids` / `target_roles`.
 *
 * Regression: `src/components/annual-review/AnnualReviewGate.test.tsx`.
 * Policy: POLICY.md §AR-PILOT-ALLOWLIST.
 */
export function AnnualReviewGate({ children }: { children: React.ReactNode }) {
  const { data: enabled, isLoading, isError } = useAnnualReviewFlag();
  const { user } = useAuth();
  const { data: cycle } = useActiveCycle();
  const { data: myInstance } = useMyInstance(user?.id, cycle?.id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" aria-hidden />
        <span className="text-sm">Checking access…</span>
      </div>
    );
  }

  // Fail closed: any error or explicit false → redirect. Safest default for a
  // pilot allowlist.
  if (isError || enabled !== true) {
    // Diagnostic surface (§AR-PILOT-ALLOWLIST-SSOT): if the user actually has
    // a seeded instance in the active cycle but the flag still says no, don't
    // silently redirect — show a message so HR/support can trace it, instead
    // of the user thinking self-review is broken.
    if (myInstance) {
      // eslint-disable-next-line no-console
      console.warn('[AnnualReviewGate] flag denied but instance exists', {
        userId: user?.id, instanceId: myInstance.id, cycleId: cycle?.id,
      });
      return (
        <div className="p-6 max-w-xl mx-auto">
          <Card>
            <CardHeader><CardTitle>Annual Review access pending</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                A review has been assigned to you, but your account is not yet
                enabled for the Annual Review pilot. Please contact HR / your
                admin and share your employee code so they can enable access.
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default AnnualReviewGate;