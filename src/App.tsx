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
const GovernanceExplainer = lazy(() => import("./pages/admin/GovernanceExplainer"));
const ImportData = lazy(() => import("./pages/admin/ImportData"));
const SystemSettings = lazy(() => import("./pages/admin/SystemSettings"));
const WorkflowConfig = lazy(() => import("./pages/admin/WorkflowConfig"));
const OrgKpiDataEntry = lazy(() => import("./pages/admin/OrgKpiDataEntry"));
const OrgKpiOverview = lazy(() => import("./pages/admin/OrgKpiOverview"));
const KRALibrary = lazy(() => import("./pages/admin/KRALibrary"));
const TemplateBundles = lazy(() => import("./pages/admin/TemplateBundles"));
const BundleEditor = lazy(() => import("./pages/admin/BundleEditor"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const PIPManagement = lazy(() => import("./pages/admin/PIPManagement"));
const EmailLogs = lazy(() => import("./pages/admin/EmailLogs"));
const ObservationsOverview = lazy(() => import("./pages/admin/ObservationsOverview"));
const RollbackRequests = lazy(() => import("./pages/admin/RollbackRequests"));
const KpiMappingMatrix = lazy(() => import("./pages/admin/KpiMappingMatrix"));
const KpiWeightageDashboard = lazy(() => import("./pages/admin/KpiWeightageDashboard"));
const PendingSelfReviews = lazy(() => import("./pages/admin/PendingSelfReviews"));
const IncentiveConfig = lazy(() => import("./pages/admin/IncentiveConfig"));
const IncentiveDataEntry = lazy(() => import("./pages/admin/IncentiveDataEntry"));
const EmployeeDevelopment = lazy(() => import("./pages/admin/EmployeeDevelopment"));
const OrgKpiAuditReview = lazy(() => import("./pages/admin/OrgKpiAuditReview"));
const EmployeeMasterBackfill = lazy(() => import("./pages/admin/EmployeeMasterBackfill"));
const ModuleHubSettings = lazy(() => import("./pages/admin/ModuleHubSettings"));

// Safety module shell + pages
const SafetyLayout = lazy(() =>
  import("./components/safety/SafetyLayout").then((m) => ({ default: m.SafetyLayout }))
);
const SafetyHome = lazy(() => import("./pages/safety/SafetyHome"));
const SafetyUsers = lazy(() => import("./pages/safety/SafetyUsers"));
const SafetyIncidents = lazy(() => import("./pages/safety/SafetyIncidents"));
const SafetyIncidentNew = lazy(() => import("./pages/safety/SafetyIncidentNew"));
const SafetyIncidentDetail = lazy(() => import("./pages/safety/SafetyIncidentDetail"));
const SafetySlaMonitor = lazy(() => import("./pages/safety/SafetySlaMonitor"));
const SafetyAuditLog = lazy(() => import("./pages/safety/SafetyAuditLog"));
const SafetyPermits = lazy(() => import("./pages/safety/SafetyPermits"));
const SafetyPermitNew = lazy(() => import("./pages/safety/SafetyPermitNew"));
const SafetyPermitDetail = lazy(() => import("./pages/safety/SafetyPermitDetail"));
const SafetyPermitTypeConfig = lazy(() => import("./pages/safety/SafetyPermitTypeConfig"));
const SafetyTraining = lazy(() => import("./pages/safety/SafetyTraining"));
const SafetyTrainingAdmin = lazy(() => import("./pages/safety/SafetyTrainingAdmin"));
const SafetyAssets = lazy(() => import("./pages/safety/SafetyAssets"));
const SafetyAssetNew = lazy(() => import("./pages/safety/SafetyAssetNew"));
const SafetyAssetDetail = lazy(() => import("./pages/safety/SafetyAssetDetail"));
const SafetyAudits = lazy(() => import("./pages/safety/SafetyAudits"));
const SafetyAuditTemplates = lazy(() => import("./pages/safety/SafetyAuditTemplates"));
const SafetyAuditRunNew = lazy(() => import("./pages/safety/SafetyAuditRunNew"));
const SafetyAuditRunDetail = lazy(() => import("./pages/safety/SafetyAuditRunDetail"));
const SafetyAuditScoreboard = lazy(() => import("./pages/safety/SafetyAuditScoreboard"));
const SafetyEmergency = lazy(() => import("./pages/safety/SafetyEmergency"));
const SafetyDrillNew = lazy(() => import("./pages/safety/SafetyDrillNew"));
const SafetyDrillDetail = lazy(() => import("./pages/safety/SafetyDrillDetail"));
const SafetyEmergencyContacts = lazy(() => import("./pages/safety/SafetyEmergencyContacts"));

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
const BottleneckReport = lazy(() => import("./pages/reports/BottleneckReport"));
const KpiStatusTracker = lazy(() => import("./pages/reports/KpiStatusTracker"));
const KpiJourneyReport = lazy(() => import("./pages/reports/KpiJourneyReport"));
const IncentiveReport = lazy(() => import("./pages/reports/IncentiveReport"));
const VarianceReport = lazy(() => import("./pages/reports/VarianceReport"));
const ManagerTeamKpiReport = lazy(() => import("./pages/reports/ManagerTeamKpiReport"));
const TeamVsManagerScoreReport = lazy(() => import("./pages/reports/TeamVsManagerScoreReport"));
const KpiScorecardDetail = lazy(() => import("./pages/reports/KpiScorecardDetail"));
const KpiEmployeeMatrix = lazy(() => import("./pages/reports/KpiEmployeeMatrix"));
const CustomReport = lazy(() => import("./pages/reports/CustomReport"));

// Layout components
import { ReportRoute } from "./components/layout/ReportRoute";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reference data rarely changes within a session — keep it fresh in
      // memory for 10 minutes so route changes don't trigger refetches.
      staleTime: 10 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      retry: 1,
      // Keep previous data visible while a refetch is in flight to avoid
      // loader flicker on filter/period changes.
      placeholderData: (prev: unknown) => prev,
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
              {/* Safety module — fully decoupled shell. Sibling of /home so PMS chrome never renders here. */}
              <Route
                path="/safety"
                element={<Suspense fallback={<PageFallback />}><SafetyLayout /></Suspense>}
              >
                <Route index element={<Suspense fallback={<PageFallback />}><SafetyHome /></Suspense>} />
                <Route path="incidents" element={<Suspense fallback={<PageFallback />}><SafetyIncidents /></Suspense>} />
                <Route path="incidents/new" element={<Suspense fallback={<PageFallback />}><SafetyIncidentNew /></Suspense>} />
                <Route path="incidents/:id" element={<Suspense fallback={<PageFallback />}><SafetyIncidentDetail /></Suspense>} />
                <Route path="permits" element={<Suspense fallback={<PageFallback />}><SafetyPermits /></Suspense>} />
                <Route path="permits/new" element={<Suspense fallback={<PageFallback />}><SafetyPermitNew /></Suspense>} />
                <Route path="permits/:id" element={<Suspense fallback={<PageFallback />}><SafetyPermitDetail /></Suspense>} />
                <Route path="training" element={<Suspense fallback={<PageFallback />}><SafetyTraining /></Suspense>} />
                <Route path="training/admin" element={<Suspense fallback={<PageFallback />}><SafetyTrainingAdmin /></Suspense>} />
                <Route path="assets" element={<Suspense fallback={<PageFallback />}><SafetyAssets /></Suspense>} />
                <Route path="assets/new" element={<Suspense fallback={<PageFallback />}><SafetyAssetNew /></Suspense>} />
                <Route path="assets/:id" element={<Suspense fallback={<PageFallback />}><SafetyAssetDetail /></Suspense>} />
                <Route path="audits" element={<Suspense fallback={<PageFallback />}><SafetyAudits /></Suspense>} />
                <Route path="audits/templates" element={<Suspense fallback={<PageFallback />}><SafetyAuditTemplates /></Suspense>} />
                <Route path="audits/runs/new" element={<Suspense fallback={<PageFallback />}><SafetyAuditRunNew /></Suspense>} />
                <Route path="audits/runs/:id" element={<Suspense fallback={<PageFallback />}><SafetyAuditRunDetail /></Suspense>} />
                <Route path="audits/scoreboard" element={<Suspense fallback={<PageFallback />}><SafetyAuditScoreboard /></Suspense>} />
                <Route path="emergency" element={<Suspense fallback={<PageFallback />}><SafetyEmergency /></Suspense>} />
                <Route path="emergency/drills/new" element={<Suspense fallback={<PageFallback />}><SafetyDrillNew /></Suspense>} />
                <Route path="emergency/drills/:id" element={<Suspense fallback={<PageFallback />}><SafetyDrillDetail /></Suspense>} />
                <Route path="emergency/contacts" element={<Suspense fallback={<PageFallback />}><SafetyEmergencyContacts /></Suspense>} />
                <Route path="settings/permit-types" element={<Suspense fallback={<PageFallback />}><SafetyPermitTypeConfig /></Suspense>} />
                <Route path="settings/sla" element={<Suspense fallback={<PageFallback />}><SafetySlaMonitor /></Suspense>} />
                <Route path="settings/users" element={<Suspense fallback={<PageFallback />}><SafetyUsers /></Suspense>} />
                <Route path="settings/audit" element={<Suspense fallback={<PageFallback />}><SafetyAuditLog /></Suspense>} />
              </Route>
              <Route element={<DashboardLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/my-kpis" element={<Suspense fallback={<PageFallback />}><MyKpis /></Suspense>} /> {/* Redirects to /dashboard */}
                <Route path="/self-review" element={<Navigate to="/dashboard" replace />} />
                <Route path="/kra-acceptance" element={<Navigate to="/dashboard" replace />} />
                <Route path="/profile" element={
                  <ProtectedRoute allowedRoles={['admin', 'manager', 'employee', 'auditor', 'management', 'hr_pms', 'skip_level']}>
                    <Suspense fallback={<PageFallback />}><ProfileSettings /></Suspense>
                  </ProtectedRoute>
                } />
                <Route path="/queries" element={<QueryInbox />} />
                <Route path="/pms-policy" element={
                  <ProtectedRoute allowedRoles={['admin', 'manager', 'employee', 'auditor', 'management', 'hr_pms', 'skip_level']}>
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
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-dashboard">
                    <AdminDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/admin/users" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-users">
                    <UserManagement />
                  </ProtectedRoute>
                } />
                <Route path="/admin/kpis" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-kpis">
                    <AllKpis />
                  </ProtectedRoute>
                } />
                <Route path="/admin/organization" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-organization">
                    <Organization />
                  </ProtectedRoute>
                } />
                <Route path="/admin/categories" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-categories">
                    <Categories />
                  </ProtectedRoute>
                } />
                <Route path="/admin/review-periods" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-review-periods">
                    <ReviewPeriods />
                  </ProtectedRoute>
                } />
                <Route path="/admin/governance-explainer" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-governance">
                    <GovernanceExplainer />
                  </ProtectedRoute>
                } />
                <Route path="/admin/import" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-import">
                    <ImportData />
                  </ProtectedRoute>
                } />
                <Route path="/admin/employee-master-backfill" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-settings">
                    <EmployeeMasterBackfill />
                  </ProtectedRoute>
                } />
              <Route path="/admin/module-hub" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Suspense fallback={<PageFallback />}><ModuleHubSettings /></Suspense>
                </ProtectedRoute>
              } />
                <Route path="/admin/settings" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-settings">
                    <SystemSettings />
                  </ProtectedRoute>
                } />
                <Route path="/admin/workflow-config" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-workflow">
                    <WorkflowConfig />
                  </ProtectedRoute>
                } />
                <Route path="/admin/org-kpi-data" element={
                  <DataOwnerRoute>
                    <OrgKpiDataEntry />
                  </DataOwnerRoute>
                } />
                <Route path="/admin/org-kpi-overview" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-org-kpi-overview">
                    <OrgKpiOverview />
                  </ProtectedRoute>
                } />
                <Route path="/admin/templates" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-templates">
                    <KRALibrary />
                  </ProtectedRoute>
                } />
                <Route path="/admin/bundles" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-bundles">
                    <TemplateBundles />
                  </ProtectedRoute>
                } />
                <Route path="/admin/bundles/new" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-bundles">
                    <BundleEditor />
                  </ProtectedRoute>
                } />
                <Route path="/admin/bundles/:id/edit" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-bundles">
                    <BundleEditor />
                  </ProtectedRoute>
                } />
                
                {/* Report routes - dynamic access from report_access_config */}
                <Route path="/reports" element={
                  <ProtectedRoute allowedRoles={['manager', 'admin', 'auditor', 'management', 'employee', 'hr_pms', 'skip_level']}>
                    <ReportsHub />
                  </ProtectedRoute>
                } />
                <Route path="/reports/performance" element={
                  <ReportRoute reportKey="performance">
                    <PerformanceReport />
                  </ReportRoute>
                } />
                <Route path="/reports/kra-issuance" element={
                  <ReportRoute reportKey="kra-issuance">
                    <KRAIssuance />
                  </ReportRoute>
                } />
                <Route path="/reports/queries" element={
                  <ReportRoute reportKey="queries">
                    <QueryReport />
                  </ReportRoute>
                } />
                <Route path="/reports/department" element={
                  <ReportRoute reportKey="department">
                    <DepartmentReport />
                  </ReportRoute>
                } />
                <Route path="/reports/completion" element={
                  <ReportRoute reportKey="completion">
                    <CompletionReport />
                  </ReportRoute>
                } />
                <Route path="/reports/audit-trail" element={
                  <ReportRoute reportKey="audit-trail">
                    <AuditTrailReport />
                  </ReportRoute>
                } />
                <Route path="/reports/monthly-scorecard" element={
                  <ReportRoute reportKey="monthly-scorecard">
                    <MonthlyScorecardReport />
                  </ReportRoute>
                } />
                <Route path="/reports/employee-summary" element={
                  <ReportRoute reportKey="employee-summary">
                    <EmployeePerformanceSummary />
                  </ReportRoute>
                } />
                <Route path="/reports/tni" element={
                  <ReportRoute reportKey="tni">
                    <TNIReport />
                  </ReportRoute>
                } />
                <Route path="/reports/issues" element={
                  <ReportRoute reportKey="issues">
                    <IssuesReport />
                  </ReportRoute>
                } />
                <Route path="/reports/kpi-detail" element={
                  <ReportRoute reportKey="kpi-detail">
                    <Suspense fallback={<PageFallback />}><KpiDetailReport /></Suspense>
                  </ReportRoute>
                } />
                <Route path="/reports/bottleneck" element={
                  <ReportRoute reportKey="bottleneck">
                    <Suspense fallback={<PageFallback />}><BottleneckReport /></Suspense>
                  </ReportRoute>
                } />
                <Route path="/reports/kpi-status-tracker" element={
                  <ReportRoute reportKey="kpi-status-tracker">
                    <Suspense fallback={<PageFallback />}><KpiStatusTracker /></Suspense>
                  </ReportRoute>
                } />
                <Route path="/reports/kpi-journey" element={
                  <ReportRoute reportKey="kpi-journey">
                    <Suspense fallback={<PageFallback />}><KpiJourneyReport /></Suspense>
                  </ReportRoute>
                } />
                <Route path="/admin/pip" element={
                  <ProtectedRoute allowedRoles={['manager', 'admin', 'management']} menuKey="admin-pip">
                    <PIPManagement />
                  </ProtectedRoute>
                } />
                <Route path="/admin/observations" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-observations">
                    <ObservationsOverview />
                  </ProtectedRoute>
                } />
                <Route path="/admin/email-logs" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-email-logs">
                    <EmailLogs />
                  </ProtectedRoute>
                } />
                <Route path="/admin/rollback-requests" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-rollback-requests">
                    <Suspense fallback={<PageFallback />}><RollbackRequests /></Suspense>
                  </ProtectedRoute>
                } />
                <Route path="/admin/kpi-mapping" element={
                  <ProtectedRoute allowedRoles={['admin', 'manager', 'auditor', 'hr_pms', 'management']} menuKey="admin-kpi-mapping">
                    <Suspense fallback={<PageFallback />}><KpiMappingMatrix /></Suspense>
                  </ProtectedRoute>
                } />
                <Route path="/admin/kpi-weightage" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-kpi-weightage">
                    <Suspense fallback={<PageFallback />}><KpiWeightageDashboard /></Suspense>
                  </ProtectedRoute>
                } />
                <Route path="/admin/pending-reviews" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-pending-reviews">
                    <Suspense fallback={<PageFallback />}><PendingSelfReviews /></Suspense>
                  </ProtectedRoute>
                } />
                <Route path="/admin/incentive-config" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-incentive">
                    <Suspense fallback={<PageFallback />}><IncentiveConfig /></Suspense>
                  </ProtectedRoute>
                } />
                <Route path="/admin/incentive-data-entry" element={
                  <ProtectedRoute allowedRoles={['admin']} menuKey="admin-incentive-data">
                    <Suspense fallback={<PageFallback />}><IncentiveDataEntry /></Suspense>
                  </ProtectedRoute>
                } />
                <Route path="/admin/employee-development" element={
                  <ProtectedRoute allowedRoles={['admin', 'hr_pms']} menuKey="admin-employee-development">
                    <Suspense fallback={<PageFallback />}><EmployeeDevelopment /></Suspense>
                  </ProtectedRoute>
                } />
                <Route path="/admin/org-kpi-audit-review" element={
                  <ProtectedRoute allowedRoles={['auditor', 'admin']} menuKey="admin-org-kpi-audit">
                    <Suspense fallback={<PageFallback />}><OrgKpiAuditReview /></Suspense>
                  </ProtectedRoute>
                } />
                <Route path="/reports/incentive" element={
                  <ReportRoute reportKey="incentive">
                    <Suspense fallback={<PageFallback />}><IncentiveReport /></Suspense>
                  </ReportRoute>
                } />
                <Route path="/reports/variance" element={
                  <ReportRoute reportKey="variance">
                    <Suspense fallback={<PageFallback />}><VarianceReport /></Suspense>
                  </ReportRoute>
                } />
                <Route path="/reports/manager-team-kpi" element={
                  <ReportRoute reportKey="manager-team-kpi">
                    <Suspense fallback={<PageFallback />}><ManagerTeamKpiReport /></Suspense>
                  </ReportRoute>
                } />
                <Route path="/reports/team-vs-manager-score" element={
                  <ReportRoute reportKey="team-vs-manager-score">
                    <Suspense fallback={<PageFallback />}><TeamVsManagerScoreReport /></Suspense>
                  </ReportRoute>
                } />
                <Route path="/reports/kpi-scorecard-detail" element={
                  <ReportRoute reportKey="kpi-scorecard-detail">
                    <Suspense fallback={<PageFallback />}><KpiScorecardDetail /></Suspense>
                  </ReportRoute>
                } />
                <Route path="/reports/kpi-employee-matrix" element={
                  <ReportRoute reportKey="kpi-employee-matrix">
                    <Suspense fallback={<PageFallback />}><KpiEmployeeMatrix /></Suspense>
                  </ReportRoute>
                } />
                <Route path="/reports/custom/:id" element={
                  <ProtectedRoute allowedRoles={['admin','manager','employee','auditor','management','hr_pms','skip_level']}>
                    <Suspense fallback={<PageFallback />}><CustomReport /></Suspense>
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
