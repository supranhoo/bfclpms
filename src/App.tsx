import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import MyKpis from "./pages/MyKpis";
import TeamReview from "./pages/TeamReview";
import AuditPanel from "./pages/AuditPanel";
import ManagementReview from "./pages/ManagementReview";
import AuditLogs from "./pages/AuditLogs";
import QueryInbox from "./pages/QueryInbox";
import UserManagement from "./pages/admin/UserManagement";
import AllKpis from "./pages/admin/AllKpis";
import Organization from "./pages/admin/Organization";
import Categories from "./pages/admin/Categories";
import ReviewPeriods from "./pages/admin/ReviewPeriods";
import ImportData from "./pages/admin/ImportData";
import SystemSettings from "./pages/admin/SystemSettings";
import WorkflowConfig from "./pages/admin/WorkflowConfig";
import PerformanceReport from "./pages/reports/PerformanceReport";
import KRAIssuance from "./pages/reports/KRAIssuance";
import KRAAcceptance from "./pages/KRAAcceptance";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/my-kpis" element={<MyKpis />} />
              {/* Redirect old self-review route to my-kpis for backward compatibility */}
              <Route path="/self-review" element={<Navigate to="/my-kpis" replace />} />
              <Route path="/kra-acceptance" element={<KRAAcceptance />} />
              <Route path="/queries" element={<QueryInbox />} />
              
              {/* Manager-protected routes */}
              <Route path="/team-review" element={
                <ProtectedRoute allowedRoles={['manager', 'admin']}>
                  <TeamReview />
                </ProtectedRoute>
              } />
              
              {/* Management-protected routes */}
              <Route path="/management-review" element={
                <ProtectedRoute allowedRoles={['management', 'admin']}>
                  <ManagementReview />
                </ProtectedRoute>
              } />
              
              {/* Auditor-protected routes */}
              <Route path="/audit" element={
                <ProtectedRoute allowedRoles={['auditor', 'admin']}>
                  <AuditPanel />
                </ProtectedRoute>
              } />
              <Route path="/audit-logs" element={
                <ProtectedRoute allowedRoles={['auditor', 'admin']}>
                  <AuditLogs />
                </ProtectedRoute>
              } />
              
              {/* Admin-protected routes */}
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
              
              {/* Report routes - accessible to managers and admins */}
              <Route path="/reports/performance" element={
                <ProtectedRoute allowedRoles={['manager', 'admin', 'auditor']}>
                  <PerformanceReport />
                </ProtectedRoute>
              } />
              <Route path="/reports/kra-issuance" element={
                <ProtectedRoute allowedRoles={['manager', 'admin']}>
                  <KRAIssuance />
                </ProtectedRoute>
              } />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
