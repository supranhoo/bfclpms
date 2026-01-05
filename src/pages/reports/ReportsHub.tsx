import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart3, 
  FileText, 
  AlertTriangle, 
  TrendingUp, 
  Building2, 
  Users,
  ClipboardList,
  Calendar
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
    title: 'Performance Report',
    description: 'Organization-wide performance analytics with rating distribution and category breakdown',
    icon: BarChart3,
    path: '/reports/performance',
    color: 'text-primary',
  },
  {
    title: 'KRA Issuance Report',
    description: 'Track KPI issuance status, completion rates, and category-wise breakdown',
    icon: FileText,
    path: '/reports/kra-issuance',
    color: 'text-blue-500',
  },
  {
    title: 'Query & Issues Report',
    description: 'All open and resolved queries with response times and resolution status',
    icon: AlertTriangle,
    path: '/reports/queries',
    color: 'text-warning',
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
];

export default function ReportsHub() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-muted-foreground">
          Access comprehensive analytics and insights across all performance metrics
        </p>
      </div>

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
