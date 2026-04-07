import { Suspense } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarProvider, SidebarInset, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Loader2 } from 'lucide-react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useRealtimeKpiSync } from '@/hooks/useRealtimeKpiSync';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';

function DashboardContent() {
  const { state, isMobile, openMobile } = useSidebar();
  
  // Show floating trigger when:
  // - Mobile: sidebar sheet is closed (openMobile === false)
  // - Desktop: sidebar is collapsed (state === 'collapsed')
  const showFloatingTrigger = isMobile ? !openMobile : state === 'collapsed';
  
  return (
    <>
      {showFloatingTrigger && (
        <div className="fixed top-3 left-3 z-50 sm:top-4 sm:left-4">
          <SidebarTrigger className="bg-background border shadow-sm rounded-md p-2 hover:bg-accent min-h-[44px] min-w-[44px]" />
        </div>
      )}
      <SidebarInset>
        <main className="flex-1 overflow-auto p-3 sm:p-6 bg-muted/30">
          <ErrorBoundary>
            <Suspense fallback={
              <div className="min-h-[200px] flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            }>
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
