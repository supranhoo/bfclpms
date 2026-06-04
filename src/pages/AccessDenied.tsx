import { useNavigate } from 'react-router-dom';
import { MinimalHeader } from '@/components/layout/MinimalHeader';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';

/**
 * Phase 4A — Standalone 403 page rendered by privileged route guards
 * (`PlatformOwnerRoute`, `ImplementationConsoleRoute`) when access is denied.
 * Replaces the prior silent `Navigate to="/home"` redirect so direct-URL
 * probing is visibly denied. No data fetching, no auth side effects.
 */
export default function AccessDenied() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-muted/30">
      <MinimalHeader />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="max-w-md mx-auto text-center bg-card border border-border rounded-lg p-8 shadow-sm">
          <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <ShieldAlert className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Access denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You do not have permission to view this page.
          </p>
          <Button className="mt-6" onClick={() => navigate('/home')}>
            Back to Hub
          </Button>
        </div>
      </main>
    </div>
  );
}