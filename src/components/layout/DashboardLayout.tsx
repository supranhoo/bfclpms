import { Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useIsFetching } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarProvider, SidebarInset, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Loader2 } from 'lucide-react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useRealtimeKpiSync } from '@/hooks/useRealtimeKpiSync';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { PageLoadingOverlay } from '@/components/ui/PageLoadingOverlay';

/**
 * RouteDataLoadingGate
 * --------------------
 * Shows the centered PageLoadingOverlay during the FIRST fetch burst that
 * follows a route change. On `pathname` change we arm the gate; while armed
 * AND `useIsFetching() > 0` the overlay is visible. Once the fetch count
 * drops to 0 we disarm — subsequent background refetches (window focus,
 * realtime sync) stay silent. Pure presentation; no business logic.
 *
 * v2.66.13 (perf):
 *  - 150ms grace period before showing the overlay so most navigations
 *    never flash the rocket card.
 *  - Safety cap reduced from 15s → 6s. The Postgres statement timeout is
 *    8s; anything longer than 6s is a real failure and inline error UI
 *    should take over instead of an apparently-frozen "Please wait".
 */
function RouteDataLoadingGate() {
  const { pathname } = useLocation();
  const isFetching = useIsFetching();
  const [armed, setArmed] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const lastPathRef = useRef(pathname);
  // Safety: auto-disarm if the first fetch burst never resolves within 6s.
  const armTimeoutRef = useRef<number | null>(null);
  // Grace period: only show the overlay if loading takes longer than 150ms.
  const graceTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (lastPathRef.current !== pathname) {
      lastPathRef.current = pathname;
      setArmed(true);
      setShowOverlay(false);
      if (armTimeoutRef.current) window.clearTimeout(armTimeoutRef.current);
      armTimeoutRef.current = window.setTimeout(() => {
        setArmed(false);
        setShowOverlay(false);
      }, 6000);
    }
  }, [pathname]);

  useEffect(() => {
    if (armed && isFetching === 0) {
      setArmed(false);
      setShowOverlay(false);
      if (graceTimeoutRef.current) {
        window.clearTimeout(graceTimeoutRef.current);
        graceTimeoutRef.current = null;
      }
      if (armTimeoutRef.current) {
        window.clearTimeout(armTimeoutRef.current);
        armTimeoutRef.current = null;
      }
    }
  }, [armed, isFetching]);

  // Grace period before showing the overlay — avoids flashing for fast loads.
  useEffect(() => {
    if (armed && isFetching > 0 && !showOverlay) {
      if (graceTimeoutRef.current) window.clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = window.setTimeout(() => setShowOverlay(true), 150);
      return () => {
        if (graceTimeoutRef.current) {
          window.clearTimeout(graceTimeoutRef.current);
          graceTimeoutRef.current = null;
        }
      };
    }
  }, [armed, isFetching, showOverlay]);

  return <PageLoadingOverlay open={armed && showOverlay && isFetching > 0} label="Please wait" />;
}

function DashboardContent() {
  const { state, isMobile, openMobile } = useSidebar();
  const location = useLocation();
  
  // Show floating trigger when:
  // - Mobile: sidebar sheet is closed (openMobile === false)
  // - Desktop: sidebar is collapsed (state === 'collapsed')
  const showFloatingTrigger = isMobile ? !openMobile : state === 'collapsed';
  
  return (
    <>
      <RouteDataLoadingGate />
      {showFloatingTrigger && (
        <div className="fixed top-3 left-3 z-50 sm:top-4 sm:left-4">
          <SidebarTrigger className="bg-background border shadow-sm rounded-md p-2 hover:bg-accent min-h-[44px] min-w-[44px]" />
        </div>
      )}
      <SidebarInset className="min-w-0">
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-5 sm:py-4 lg:px-6 lg:py-5 bg-background min-w-0">
          <ErrorBoundary resetKey={location.key}>
            <Suspense fallback={<PageLoadingOverlay open label="Please wait" />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </SidebarInset>
    </>
  );
}

export function DashboardLayout() {
  const { user, loading } = useAuth();
  useRealtimeKpiSync();
  useIdleTimeout();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <DashboardContent />
    </SidebarProvider>
  );
}
