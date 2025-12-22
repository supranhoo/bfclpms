import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import MyKpis from "./pages/MyKpis";
import SelfReview from "./pages/SelfReview";
import TeamReview from "./pages/TeamReview";
import AuditPanel from "./pages/AuditPanel";
import AuditLogs from "./pages/AuditLogs";
import QueryInbox from "./pages/QueryInbox";
import UserManagement from "./pages/admin/UserManagement";
import AllKpis from "./pages/admin/AllKpis";
import Organization from "./pages/admin/Organization";
import Categories from "./pages/admin/Categories";
import ImportData from "./pages/admin/ImportData";
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
              <Route path="/self-review" element={<SelfReview />} />
              <Route path="/kra-acceptance" element={<KRAAcceptance />} />
              <Route path="/queries" element={<QueryInbox />} />
              <Route path="/team-review" element={<TeamReview />} />
              <Route path="/audit" element={<AuditPanel />} />
              <Route path="/audit-logs" element={<AuditLogs />} />
              <Route path="/admin/users" element={<UserManagement />} />
              <Route path="/admin/kpis" element={<AllKpis />} />
              <Route path="/admin/organization" element={<Organization />} />
              <Route path="/admin/categories" element={<Categories />} />
              <Route path="/admin/import" element={<ImportData />} />
              <Route path="/reports/performance" element={<PerformanceReport />} />
              <Route path="/reports/kra-issuance" element={<KRAIssuance />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
