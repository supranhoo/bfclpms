import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
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
}

const reports: ReportCard[] = [
  {
    title: 'Employee Performance Summary',
    description: 'Comprehensive view of employee scores, ratings, and review status by period',
    icon: Users,
    path: '/reports/employee-summary',
    color: 'text-emerald-500',
  },
  {
    title: 'Performance Report',
    description: 'Organization-wide performance analytics with rating distribution and category breakdown',
    icon: BarChart3,
    path: '/reports/performance',
    color: 'text-primary',
  },
  {
    title: 'Monthly Scorecard',
    description: 'Employee performance scorecards with scores from each review stage',
    icon: FileText,
    path: '/reports/monthly-scorecard',
    color: 'text-blue-500',
  },
  {
    title: 'KRA Issuance Report',
    description: 'Track KPI issuance status, completion rates, and category-wise breakdown',
    icon: FileText,
    path: '/reports/kra-issuance',
    color: 'text-cyan-500',
  },
  {
    title: 'Query Report',
    description: 'All open and resolved queries with response times and resolution status',
    icon: AlertTriangle,
    path: '/reports/queries',
    color: 'text-warning',
  },
  {
    title: 'Unified Issues Report',
    description: 'Consolidated view of queries, training needs, PIPs, stalled KPIs, and pending actions',
    icon: AlertTriangle,
    path: '/reports/issues',
    color: 'text-destructive',
  },
  {
    title: 'Completion Rate Report',
    description: 'Period-wise completion rates showing monthly/quarterly progress trends',
    icon: TrendingUp,
    path: '/reports/completion',
    color: 'text-green-500',
  },
  {
    title: 'Department Summary',
    description: 'Aggregated performance scores and KPI status by department and division',
    icon: Building2,
    path: '/reports/department',
    color: 'text-purple-500',
  },
  {
    title: 'Manager Team Report',
    description: 'Manager-wise team performance showing average scores and completion rates',
    icon: Users,
    path: '/reports/manager-team',
    color: 'text-cyan-500',
  },
  {
    title: 'Audit Trail Report',
    description: 'Complete history of all KPI modifications, approvals, and status changes',
    icon: ClipboardList,
    path: '/reports/audit-trail',
    color: 'text-orange-500',
  },
  {
    title: 'Period Comparison',
    description: 'Compare performance metrics across different review periods',
    icon: Calendar,
    path: '/reports/period-comparison',
    color: 'text-indigo-500',
  },
  {
    title: 'Training Needs (TNI)',
    description: 'Identify skill gaps and training requirements across the organization',
    icon: GraduationCap,
    path: '/reports/tni',
    color: 'text-rose-500',
  },
  {
    title: 'KPI Detail Report',
    description: 'KPI-level drill-down showing all stage scores (Self, Manager, Skip-Level, HR PMS, Auditor, Mgmt, Final) with weighted totals. N/A KPIs shown with N/A labels.',
    icon: Table2,
    path: '/reports/kpi-detail',
    color: 'text-violet-500',
  },
  {
    title: 'KPI Mapping Matrix',
    description: '12-month view of KPI mapping status per employee with org-hierarchy filters',
    icon: Grid3X3,
    path: '/admin/kpi-mapping',
    color: 'text-teal-500',
  },
  {
    title: 'Workflow Bottleneck Report',
    description: 'Identify stuck KPIs by workflow stage, responsible reviewer, and days pending',
    icon: Workflow,
    path: '/reports/bottleneck',
    color: 'text-amber-500',
  },
];

export default function ReportsHub() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Access comprehensive analytics and insights across all performance metrics"
        backTo="/"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {reports.map((report) => (
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
