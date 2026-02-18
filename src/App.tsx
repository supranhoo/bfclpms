import { Suspense, lazy } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./components/ThemeProvider";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { DataOwnerRoute } from "./components/layout/DataOwnerRoute";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { Loader2 } from 'lucide-react';

// Lazy-loaded page components
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ProfileSettings = lazy(() => import("./pages/ProfileSettings"));
const ModuleHub = lazy(() => import("./pages/ModuleHub"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const MyKpis = lazy(() => import("./pages/MyKpis"));
const QueryInbox = lazy(() => import("./pages/QueryInbox"));
const PMSPolicy = lazy(() => import("./pages/PMSPolicy"));
const ManagementDashboard = lazy(() => import("./pages/ManagementDashboard"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Admin pages
const UserManagement = lazy(() => import("./pages/admin/UserManagement"));
const AllKpis = lazy(() => import("./pages/admin/AllKpis"));
const Organization = lazy(() => import("./pages/admin/Organization"));
const Categories = lazy(() => import("./pages/admin/Categories"));
const ReviewPeriods = lazy(() => import("./pages/admin/ReviewPeriods"));
const ImportData = lazy(() => import("./pages/admin/ImportData"));
const SystemSettings = lazy(() => import("./pages/admin/SystemSettings"));
const WorkflowConfig = lazy(() => import("./pages/admin/WorkflowConfig"));
const OrgKpiDataEntry = lazy(() => import("./pages/admin/OrgKpiDataEntry"));
const OrgKpiOverview = lazy(() => import("./pages/admin/OrgKpiOverview"));
const KRALibrary = lazy(() => import("./pages/admin/KRALibrary"));
const TemplateBundles = lazy(() => import("./pages/admin/TemplateBundles"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const PIPManagement = lazy(() => import("./pages/admin/PIPManagement"));
const EmailLogs = lazy(() => import("./pages/admin/EmailLogs"));
const ObservationsOverview = lazy(() => import("./pages/admin/ObservationsOverview"));

// Report pages
const PerformanceReport = lazy(() => import("./pages/reports/PerformanceReport"));
const KRAIssuance = lazy(() => import("./pages/reports/KRAIssuance"));
const ReportsHub = lazy(() => import("./pages/reports/ReportsHub"));
const QueryReport = lazy(() => import("./pages/reports/QueryReport"));
const DepartmentReport = lazy(() => import("./pages/reports/DepartmentReport"));
const CompletionReport = lazy(() => import("./pages/reports/CompletionReport"));
const AuditTrailReport = lazy(() => import("./pages/reports/AuditTrailReport"));
const MonthlyScorecardReport = lazy(() => import("./pages/reports/MonthlyScorecardReport"));
const EmployeePerformanceSummary = lazy(() => import("./pages/reports/EmployeePerformanceSummary"));
const TNIReport = lazy(() => import("./pages/reports/TNIReport"));
const IssuesReport = lazy(() => import("./pages/reports/IssuesReport"));
const KpiDetailReport = lazy(() => import("./pages/reports/KpiDetailReport"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PageFallback() {
  return (
    <div className="min-h-[200px] flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

const App = () => (
  <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
              <Route path="/auth" element={<Suspense fallback={<PageFallback />}><Auth /></Suspense>} />
              <Route path="/reset-password" element={<Suspense fallback={<PageFallback />}><ResetPassword /></Suspense>} />
              <Route path="/home" element={<Suspense fallback={<PageFallback />}><ModuleHub /></Suspense>} />
              <Route path="/" element={<Navigate to="/home" replace />} />
              <Route element={<DashboardLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/my-kpis" element={<Suspense fallback={<PageFallback />}><MyKpis /></Suspense>} /> {/* Redirects to /dashboard */}
                <Route path="/self-review" element={<Navigate to="/dashboard" replace />} />
                <Route path="/kra-acceptance" element={<Navigate to="/dashboard" replace />} />
                <Route path="/profile" element={
                  <ProtectedRoute allowedRoles={['admin', 'manager', 'employee', 'auditor', 'management', 'hr_pms']}>
                    <Suspense fallback={<PageFallback />}><ProfileSettings /></Suspense>
                  </ProtectedRoute>
                } />
                <Route path="/queries" element={<QueryInbox />} />
                <Route path="/pms-policy" element={
                  <ProtectedRoute allowedRoles={['admin', 'manager', 'employee', 'auditor', 'management', 'hr_pms']}>
                    <PMSPolicy />
                  </ProtectedRoute>
                } />
                
                {/* Legacy routes - redirect to unified dashboard with view mode */}
                <Route path="/team-review" element={<Navigate to="/dashboard?view=team" replace />} />
                <Route path="/management-dashboard" element={
                  <ProtectedRoute allowedRoles={['management', 'admin']}>
                    <ManagementDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/management-review" element={<Navigate to="/dashboard?view=management" replace />} />
                <Route path="/audit" element={<Navigate to="/dashboard?view=audit" replace />} />
                
                {/* Auditor-protected routes */}
                <Route path="/audit-logs" element={
                  <ProtectedRoute allowedRoles={['auditor', 'admin']}>
                    <AuditLogs />
                  </ProtectedRoute>
                } />
                
                {/* Admin-protected routes */}
                <Route path="/admin" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/admin/users" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <UserManagement />
                  </ProtectedRoute>
                } />
                <Route path="/admin/kpis" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AllKpis />
                  </ProtectedRoute>
                } />
                <Route path="/admin/organization" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <Organization />
                  </ProtectedRoute>
                } />
                <Route path="/admin/categories" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <Categories />
                  </ProtectedRoute>
                } />
                <Route path="/admin/review-periods" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <ReviewPeriods />
                  </ProtectedRoute>
                } />
                <Route path="/admin/import" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <ImportData />
                  </ProtectedRoute>
                } />
                <Route path="/admin/settings" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <SystemSettings />
                  </ProtectedRoute>
                } />
                <Route path="/admin/workflow-config" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <WorkflowConfig />
                  </ProtectedRoute>
                } />
                <Route path="/admin/org-kpi-data" element={
                  <DataOwnerRoute>
                    <OrgKpiDataEntry />
                  </DataOwnerRoute>
                } />
                <Route path="/admin/org-kpi-overview" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <OrgKpiOverview />
                  </ProtectedRoute>
                } />
                <Route path="/admin/templates" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <KRALibrary />
                  </ProtectedRoute>
                } />
                <Route path="/admin/bundles" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <TemplateBundles />
                  </ProtectedRoute>
                } />
                
                {/* Report routes */}
                <Route path="/reports" element={
                  <ProtectedRoute allowedRoles={['manager', 'admin', 'auditor', 'management']}>
                    <ReportsHub />
                  </ProtectedRoute>
                } />
                <Route path="/reports/performance" element={
                  <ProtectedRoute allowedRoles={['manager', 'admin', 'auditor', 'management']}>
                    <PerformanceReport />
                  </ProtectedRoute>
                } />
                <Route path="/reports/kra-issuance" element={
                  <ProtectedRoute allowedRoles={['manager', 'admin', 'management']}>
                    <KRAIssuance />
                  </ProtectedRoute>
                } />
                <Route path="/reports/queries" element={
                  <ProtectedRoute allowedRoles={['manager', 'admin', 'auditor', 'management']}>
                    <QueryReport />
                  </ProtectedRoute>
                } />
                <Route path="/reports/department" element={
                  <ProtectedRoute allowedRoles={['manager', 'admin', 'management']}>
                    <DepartmentReport />
                  </ProtectedRoute>
                } />
                <Route path="/reports/completion" element={
                  <ProtectedRoute allowedRoles={['manager', 'admin', 'management']}>
                    <CompletionReport />
                  </ProtectedRoute>
                } />
                <Route path="/reports/audit-trail" element={
                  <ProtectedRoute allowedRoles={['admin', 'auditor']}>
                    <AuditTrailReport />
                  </ProtectedRoute>
                } />
                <Route path="/reports/monthly-scorecard" element={
                  <ProtectedRoute allowedRoles={['manager', 'admin', 'auditor', 'management']}>
                    <MonthlyScorecardReport />
                  </ProtectedRoute>
                } />
                <Route path="/reports/employee-summary" element={
                  <ProtectedRoute allowedRoles={['manager', 'admin', 'auditor', 'management']}>
                    <EmployeePerformanceSummary />
                  </ProtectedRoute>
                } />
                <Route path="/reports/tni" element={
                  <ProtectedRoute allowedRoles={['manager', 'admin', 'management']}>
                    <TNIReport />
                  </ProtectedRoute>
                } />
                <Route path="/reports/issues" element={
                  <ProtectedRoute allowedRoles={['manager', 'admin', 'auditor', 'management']}>
                    <IssuesReport />
                  </ProtectedRoute>
                } />
                <Route path="/reports/kpi-detail" element={
                  <ProtectedRoute allowedRoles={['manager', 'admin', 'auditor', 'management', 'hr_pms']}>
                    <Suspense fallback={<PageFallback />}><KpiDetailReport /></Suspense>
                  </ProtectedRoute>
                } />
                <Route path="/admin/pip" element={
                  <ProtectedRoute allowedRoles={['manager', 'admin', 'management']}>
                    <PIPManagement />
                  </ProtectedRoute>
                } />
                <Route path="/admin/observations" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <ObservationsOverview />
                  </ProtectedRoute>
                } />
                <Route path="/admin/email-logs" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <EmailLogs />
                  </ProtectedRoute>
                } />
              </Route>
              <Route path="*" element={<Suspense fallback={<PageFallback />}><NotFound /></Suspense>} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
  </ErrorBoundary>
);

export default App;
