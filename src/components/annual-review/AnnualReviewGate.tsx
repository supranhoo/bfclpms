import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAnnualReviewFlag } from '@/hooks/useAnnualReview';

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
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default AnnualReviewGate;