import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarProvider, SidebarInset, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Loader2 } from 'lucide-react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

function DashboardContent() {
  const { state } = useSidebar();
  
  return (
    <>
      {state === 'collapsed' && (
        <div className="fixed top-4 left-4 z-50">
          <SidebarTrigger className="bg-background border shadow-sm rounded-md p-2 hover:bg-accent" />
        </div>
      )}
      <SidebarInset>
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </SidebarInset>
    </>
  );
}

export function DashboardLayout() {
  const { user, loading } = useAuth();

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
