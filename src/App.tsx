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
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import MyKpis from "./pages/MyKpis";
import TeamReview from "./pages/TeamReview";
import AuditPanel from "./pages/AuditPanel";
import ManagementReview from "./pages/ManagementReview";
import ManagementDashboard from "./pages/ManagementDashboard";
import AuditLogs from "./pages/AuditLogs";
import QueryInbox from "./pages/QueryInbox";
import PMSPolicy from "./pages/PMSPolicy";
import UserManagement from "./pages/admin/UserManagement";
import AllKpis from "./pages/admin/AllKpis";
import Organization from "./pages/admin/Organization";
import Categories from "./pages/admin/Categories";
import ReviewPeriods from "./pages/admin/ReviewPeriods";
import ImportData from "./pages/admin/ImportData";
import SystemSettings from "./pages/admin/SystemSettings";
import WorkflowConfig from "./pages/admin/WorkflowConfig";
import OrgKpiDataEntry from "./pages/admin/OrgKpiDataEntry";
import OrgKpiOverview from "./pages/admin/OrgKpiOverview";
import KRALibrary from "./pages/admin/KRALibrary";
import TemplateBundles from "./pages/admin/TemplateBundles";
import AdminDashboard from "./pages/admin/AdminDashboard";
import PerformanceReport from "./pages/reports/PerformanceReport";
import KRAIssuance from "./pages/reports/KRAIssuance";
import ReportsHub from "./pages/reports/ReportsHub";
import QueryReport from "./pages/reports/QueryReport";
import DepartmentReport from "./pages/reports/DepartmentReport";
import CompletionReport from "./pages/reports/CompletionReport";
import AuditTrailReport from "./pages/reports/AuditTrailReport";
import MonthlyScorecardReport from "./pages/reports/MonthlyScorecardReport";
import EmployeePerformanceSummary from "./pages/reports/EmployeePerformanceSummary";
import TNIReport from "./pages/reports/TNIReport";
import IssuesReport from "./pages/reports/IssuesReport";
import PIPManagement from "./pages/admin/PIPManagement";

import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import ModuleHub from "./pages/ModuleHub";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/home" element={<ModuleHub />} />
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              {/* Redirect legacy routes to dashboard */}
              <Route path="/my-kpis" element={<Navigate to="/dashboard" replace />} />
              <Route path="/self-review" element={<Navigate to="/dashboard" replace />} />
              <Route path="/kra-acceptance" element={<Navigate to="/dashboard" replace />} />
              <Route path="/queries" element={<QueryInbox />} />
              <Route path="/pms-policy" element={<PMSPolicy />} />
              
              {/* Manager-protected routes */}
              <Route path="/team-review" element={
                <ProtectedRoute allowedRoles={['manager', 'admin', 'management']}>
                  <TeamReview />
                </ProtectedRoute>
              } />
              
              {/* Management-protected routes */}
              <Route path="/management-dashboard" element={<Navigate to="/dashboard" replace />} />
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
              <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
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
              
              {/* Report routes - accessible to managers and admins */}
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
              <Route path="/admin/pip" element={
                <ProtectedRoute allowedRoles={['manager', 'admin', 'management']}>
                  <PIPManagement />
                </ProtectedRoute>
              } />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
</ThemeProvider>
);

export default App;
