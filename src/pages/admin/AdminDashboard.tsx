import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { 
  Users, 
  Target, 
  ClipboardCheck, 
  AlertCircle, 
  TrendingUp,
  Clock,
  CheckCircle2,
  Shield,
  Briefcase,
  ArrowRight,
  Undo2,
  Grid3X3,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FixCorruptedScoresDialog } from '@/components/admin/FixCorruptedScoresDialog';

interface StageCount {
  stage: string;
  count: number;
}

interface DashboardStats {
  totalEmployees: number;
  totalKpis: number;
  openQueries: number;
  kpisByStage: StageCount[];
  lockedPeriods: number;
  activePeriods: number;
  pendingRollbacks: number;
}

const STAGE_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  kra_set: { label: 'KRA Set', icon: Target, color: 'bg-muted text-muted-foreground' },
  self_review: { label: 'Self Review', icon: Clock, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  manager_check: { label: 'Manager Check', icon: Users, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  audit: { label: 'Audit', icon: Shield, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  management_review: { label: 'Management Review', icon: Briefcase, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  approved: { label: 'Approved', icon: CheckCircle2, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
};

export default function AdminDashboard() {
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-dashboard-stats'],
    queryFn: async (): Promise<DashboardStats> => {
      // Fetch all stats in parallel
      const [
        { count: totalEmployees },
        { data: kpis },
        { count: openQueries },
        { data: periods },
        { count: pendingRollbacks },
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('kpis').select('status'),
        supabase.from('kpi_queries').select('*', { count: 'exact', head: true }).eq('status', 'open').eq('query_type', 'query'),
        supabase.from('review_periods').select('is_locked'),
        supabase.from('kpi_rollback_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);

      // Count KPIs by stage
      const stageCounts: Record<string, number> = {};
      (kpis || []).forEach(kpi => {
        const stage = kpi.status || 'kra_set';
        stageCounts[stage] = (stageCounts[stage] || 0) + 1;
      });

      const kpisByStage: StageCount[] = Object.entries(STAGE_CONFIG).map(([stage]) => ({
        stage,
        count: stageCounts[stage] || 0,
      }));

      const lockedPeriods = (periods || []).filter(p => p.is_locked).length;
      const activePeriods = (periods || []).filter(p => !p.is_locked).length;

      return {
        totalEmployees: totalEmployees || 0,
        totalKpis: kpis?.length || 0,
        openQueries: openQueries || 0,
        kpisByStage,
        lockedPeriods,
        activePeriods,
        pendingRollbacks: pendingRollbacks || 0,
      };
    },
  });

  const StatCard = ({ 
    title, 
    value, 
    icon: Icon, 
    description,
    onClick,
  }: { 
    title: string; 
    value: number | string; 
    icon: typeof Users; 
    description?: string;
    onClick?: () => void;
  }) => (
    <Card 
      className={onClick ? 'cursor-pointer hover:border-primary/50 transition-colors' : ''}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground">System overview and key metrics</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const pendingReviews = (stats?.kpisByStage || [])
    .filter(s => s.stage !== 'approved')
    .reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Dashboard"
        description="System overview and key metrics"
        backTo="/"
      />

      {/* Key Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Total Employees"
          value={stats?.totalEmployees || 0}
          icon={Users}
          description="Registered in the system"
          onClick={() => navigate('/admin/users')}
        />
        <StatCard
          title="Active KPIs"
          value={stats?.totalKpis || 0}
          icon={Target}
          description={`${stats?.activePeriods || 0} active review periods`}
          onClick={() => navigate('/admin/kpis')}
        />
        <StatCard
          title="Pending Reviews"
          value={pendingReviews}
          icon={ClipboardCheck}
          description="Awaiting completion"
          onClick={() => navigate('/admin/kpis')}
        />
        <StatCard
          title="Open Queries"
          value={stats?.openQueries || 0}
          icon={AlertCircle}
          description="Requires attention"
          onClick={() => navigate('/reports/queries')}
        />
        <StatCard
          title="Pending Rollbacks"
          value={stats?.pendingRollbacks || 0}
          icon={Undo2}
          description="Awaiting admin action"
          onClick={() => navigate('/admin/rollback-requests')}
        />
      </div>

      {/* Reviews by Stage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            KPIs by Review Stage
          </CardTitle>
          <CardDescription>
            Distribution of KPIs across workflow stages
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {stats?.kpisByStage.map(({ stage, count }) => {
              const config = STAGE_CONFIG[stage];
              const Icon = config?.icon || Clock;
              return (
                <div
                  key={stage}
                  className="flex flex-col items-center p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => navigate('/admin/kpis')}
                >
                  <div className={`p-3 rounded-full ${config?.color || 'bg-muted'}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="mt-3 text-2xl font-bold">{count}</div>
                  <div className="text-xs text-muted-foreground text-center mt-1">
                    {config?.label || stage}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common administrative tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Button 
              variant="outline" 
              className="justify-between h-auto py-3"
              onClick={() => navigate('/admin/users')}
            >
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>Manage Users</span>
              </div>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="justify-between h-auto py-3"
              onClick={() => navigate('/admin/import')}
            >
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                <span>Import Data</span>
              </div>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="justify-between h-auto py-3"
              onClick={() => navigate('/admin/review-periods')}
            >
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>Review Periods</span>
              </div>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="justify-between h-auto py-3"
              onClick={() => navigate('/reports')}
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                <span>View Reports</span>
              </div>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="justify-between h-auto py-3"
              onClick={() => navigate('/admin/kpi-mapping')}
            >
              <div className="flex items-center gap-2">
                <Grid3X3 className="h-4 w-4" />
                <span>KPI Mapping Matrix</span>
              </div>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <FixCorruptedScoresDialog />
          </div>
        </CardContent>
      </Card>

      {/* Period Status */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review Period Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="default" className="bg-green-600">
                  {stats?.activePeriods || 0} Active
                </Badge>
                <Badge variant="secondary">
                  {stats?.lockedPeriods || 0} Locked
                </Badge>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/admin/review-periods')}
              >
                Manage
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">System Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-sm text-muted-foreground">All systems operational</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/admin/settings')}
              >
                Settings
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
