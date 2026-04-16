import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { 
  BarChart3, 
  FileText, 
  AlertTriangle, 
  TrendingUp, 
  Building2, 
  Users,
  ClipboardList,
  Calendar,
  GraduationCap,
  Table2,
  Grid3X3,
  Workflow
} from 'lucide-react';

interface ReportCard {
  title: string;
  description: string;
  icon: React.ElementType;
  path: string;
  color: string;
  reportKey: string;
}

const reports: ReportCard[] = [
  {
    title: 'Employee Performance Summary',
    description: 'Comprehensive view of employee scores, ratings, and review status by period',
    icon: Users,
    path: '/reports/employee-summary',
    color: 'text-emerald-500',
    reportKey: 'employee-summary',
  },
  {
    title: 'Performance Report',
    description: 'Organization-wide performance analytics with rating distribution and category breakdown',
    icon: BarChart3,
    path: '/reports/performance',
    color: 'text-primary',
    reportKey: 'performance',
  },
  {
    title: 'Monthly Scorecard',
    description: 'Employee performance scorecards with scores from each review stage',
    icon: FileText,
    path: '/reports/monthly-scorecard',
    color: 'text-blue-500',
    reportKey: 'monthly-scorecard',
  },
  {
    title: 'KRA Issuance Report',
    description: 'Track KPI issuance status, completion rates, and category-wise breakdown',
    icon: FileText,
    path: '/reports/kra-issuance',
    color: 'text-cyan-500',
    reportKey: 'kra-issuance',
  },
  {
    title: 'Query Report',
    description: 'All open and resolved queries with response times and resolution status',
    icon: AlertTriangle,
    path: '/reports/queries',
    color: 'text-warning',
    reportKey: 'queries',
  },
  {
    title: 'Unified Issues Report',
    description: 'Consolidated view of queries, training needs, PIPs, stalled KPIs, and pending actions',
    icon: AlertTriangle,
    path: '/reports/issues',
    color: 'text-destructive',
    reportKey: 'issues',
  },
  {
    title: 'Completion Rate Report',
    description: 'Period-wise completion rates showing monthly/quarterly progress trends',
    icon: TrendingUp,
    path: '/reports/completion',
    color: 'text-green-500',
    reportKey: 'completion',
  },
  {
    title: 'Department Summary',
    description: 'Aggregated performance scores and KPI status by department and division',
    icon: Building2,
    path: '/reports/department',
    color: 'text-purple-500',
    reportKey: 'department',
  },
  {
    title: 'Audit Trail Report',
    description: 'Complete history of all KPI modifications, approvals, and status changes',
    icon: ClipboardList,
    path: '/reports/audit-trail',
    color: 'text-orange-500',
    reportKey: 'audit-trail',
  },
  {
    title: 'Training Needs (TNI)',
    description: 'Identify skill gaps and training requirements across the organization',
    icon: GraduationCap,
    path: '/reports/tni',
    color: 'text-rose-500',
    reportKey: 'tni',
  },
  {
    title: 'KPI Detail Report',
    description: 'KPI-level drill-down showing all stage scores (Self, Manager, Skip-Level, HR PMS, Auditor, Mgmt, Final) with weighted totals. N/A KPIs shown with N/A labels.',
    icon: Table2,
    path: '/reports/kpi-detail',
    color: 'text-violet-500',
    reportKey: 'kpi-detail',
  },
  {
    title: 'KPI Mapping Matrix',
    description: '12-month view of KPI mapping status per employee with org-hierarchy filters',
    icon: Grid3X3,
    path: '/admin/kpi-mapping',
    color: 'text-teal-500',
    reportKey: 'kpi-detail',
  },
  {
    title: 'Workflow Bottleneck Report',
    description: 'Identify stuck KPIs by workflow stage, responsible reviewer, and days pending',
    icon: Workflow,
    path: '/reports/bottleneck',
    color: 'text-amber-500',
    reportKey: 'bottleneck',
  },
  {
    title: 'KPI Status Tracker',
    description: 'Flat table of all KPIs for a month showing employee details, current workflow stage, and pending level',
    icon: ClipboardList,
    path: '/reports/kpi-status-tracker',
    color: 'text-sky-500',
    reportKey: 'kpi-status-tracker',
  },
  {
    title: 'KPI Journey Timeline',
    description: 'Complete lifecycle timeline of every KPI — from assignment through each approval stage with duration tracking',
    icon: Workflow,
    path: '/reports/kpi-journey',
    color: 'text-emerald-600',
    reportKey: 'kpi-journey',
  },
  {
    title: 'Variance Report',
    description: 'KPIs where Audit and Management scores differ — highlights review-level discrepancies',
    icon: TrendingUp,
    path: '/reports/variance',
    color: 'text-orange-600',
    reportKey: 'variance',
  },
  {
    title: 'Same KPI — Manager vs Team',
    description: 'Compare scores on shared KPIs between managers and their direct reports — only mismatches shown',
    icon: Users,
    path: '/reports/manager-team-kpi',
    color: 'text-indigo-500',
    reportKey: 'manager-team-kpi',
  },
  {
    title: 'Team Vs Manager Monthly Score',
    description: 'Employee and manager weighted average final scores side-by-side for the selected month',
    icon: BarChart3,
    path: '/reports/team-vs-manager-score',
    color: 'text-fuchsia-500',
    reportKey: 'team-vs-manager-score',
  },
  {
    title: 'KPI Scorecard Detail',
    description: 'Flat table of every KPI with employee code, name, designation, department, and scores from all review stages',
    icon: Table2,
    path: '/reports/kpi-scorecard-detail',
    color: 'text-lime-600',
    reportKey: 'kpi-scorecard-detail',
  },
  {
    title: 'KPI-Employee Score Matrix',
    description: 'Cross-tab view of KPIs vs Employees with weighted scores — for role planning and KPI flow analysis',
    icon: Grid3X3,
    path: '/reports/kpi-employee-matrix',
    color: 'text-cyan-600',
    reportKey: 'kpi-employee-matrix',
  },
];

export default function ReportsHub() {
  const navigate = useNavigate();
  const { canView, isLoading } = useReportAccess();
  const { canAccess } = useMenuAccess();

  const visibleReports = reports.filter(r => canView(r.reportKey) || canAccess(`reports-${r.reportKey}`));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Access comprehensive analytics and insights across all performance metrics"
        backTo="/"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleReports.map((report) => (
          <Card 
            key={report.path} 
            className="hover:shadow-md transition-shadow cursor-pointer group"
            onClick={() => navigate(report.path)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-muted ${report.color}`}>
                  <report.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-base group-hover:text-primary transition-colors">
                  {report.title}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm">
                {report.description}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
