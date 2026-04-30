import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Loader2 } from 'lucide-react';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { useSafetyRealtimeSync } from '@/hooks/useSafetyRealtimeSync';
import { SafetySidebar } from './SafetySidebar';
import { SafetyModuleRoute } from './SafetyModuleRoute';

/**
 * SafetyLayout
 * ------------
 * Top-level shell for /safety/*. Mirrors the PMS DashboardLayout pattern
 * but is fully decoupled — it imports zero PMS layout components, so PMS
 * chrome (AppSidebar, dashboard header, etc.) cannot leak into Safety
 * routes. Wrapped in SafetyModuleRoute so unauthorised users bounce to
 * the Hub before any Safety chrome renders.
 */
function SafetyContent() {
  const { state, isMobile, openMobile } = useSidebar();
  const showFloatingTrigger = isMobile ? !openMobile : state === 'collapsed';

  return (
    <>
      {showFloatingTrigger && (
        <div className="fixed top-3 left-3 z-50 sm:top-4 sm:left-4">
          <SidebarTrigger className="bg-background border shadow-sm rounded-md p-2 hover:bg-accent min-h-[44px] min-w-[44px]" />
        </div>
      )}
      <SidebarInset>
        <main
          className="flex-1 overflow-auto p-3 sm:p-6 bg-muted/30"
          data-testid="safety-main"
        >
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className="min-h-[200px] flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-destructive" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </SidebarInset>
    </>
  );
}

export function SafetyLayout() {
  useIdleTimeout();
  useSafetyRealtimeSync();

  return (
    <SafetyModuleRoute>
      <div data-testid="safety-shell">
        <SidebarProvider>
          <SafetySidebar />
          <SafetyContent />
        </SidebarProvider>
      </div>
    </SafetyModuleRoute>
  );
}