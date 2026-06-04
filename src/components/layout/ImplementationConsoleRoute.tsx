import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import AccessDenied from '@/pages/AccessDenied';

/**
 * Implementation Console guard.
 * Allows `platform_owner` OR any user with ≥1 row in
 * `client_implementer_assignments`. RLS makes the row visible only
 * to the user themselves, so a simple count is safe.
 */
export function ImplementationConsoleRoute({ children }: { children: React.ReactNode }) {
  const { hasRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Phase 4A (corrected): access requires an explicit role — `platform_owner`
  // OR `implementation_admin`. A bare `client_implementer_assignments` row is
  // NOT sufficient on its own (prevents ordinary PMS roles from sneaking in
  // via an assignment row). Inside the console: owners see all clients,
  // implementation_admins see only assigned clients (via existing RLS join).
  if (!hasRole('platform_owner') && !hasRole('implementation_admin')) {
    return <AccessDenied />;
  }
  return <>{children}</>;
}