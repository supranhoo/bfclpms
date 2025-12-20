import { useAuth } from '@/contexts/AuthContext';
import { useMyKpis, useReviewSubmissions } from '@/hooks/useKpis';
import { useKraCategories } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Target, TrendingUp, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

const statusColors = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  manager_check: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  audit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const statusLabels = {
  kra_set: 'KRA Set',
  self_review: 'Self Review',
  manager_check: 'Manager Check',
  audit: 'Audit',
  approved: 'Approved',
};

const ratingColors = {
  red: '#EF4444',
  yellow: '#F59E0B',
  green: '#10B981',
  blue: '#3B82F6',
};

export default function Dashboard() {
  const { profile, role } = useAuth();
  const { data: kpis, isLoading: kpisLoading } = useMyKpis();
  const { data: categories, isLoading: categoriesLoading } = useKraCategories();
  const kpiIds = kpis?.map(k => k.id) || [];
  const { data: submissions } = useReviewSubmissions(kpiIds);

  const isLoading = kpisLoading || categoriesLoading;

  // Calculate metrics
  const totalKpis = kpis?.length || 0;
  const completedKpis = kpis?.filter(k => k.status === 'approved').length || 0;
  const pendingKpis = kpis?.filter(k => k.status !== 'approved').length || 0;
  
  // Calculate overall score from submissions
  const submissionMap = new Map(submissions?.map(s => [s.kpi_id, s]));
  let totalScore = 0;
  let totalWeight = 0;
  
  kpis?.forEach(kpi => {
    const submission = submissionMap.get(kpi.id);
    const score = submission?.final_score || submission?.self_score || 0;
    const weight = kpi.weightage || 0;
    totalScore += score * weight;
    totalWeight += weight;
  });
  
  const overallScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;

  // Category distribution for pie chart
  const categoryData = categories?.map(cat => {
    const catKpis = kpis?.filter(k => k.category_id === cat.id) || [];
    return {
      name: cat.name,
      value: catKpis.length,
      color: cat.color,
    };
  }).filter(c => c.value > 0) || [];

  // Status distribution
  const statusData = Object.entries(statusLabels).map(([key, label]) => ({
    name: label,
    value: kpis?.filter(k => k.status === key).length || 0,
  })).filter(s => s.value > 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {profile?.full_name?.split(' ')[0] || 'User'}
        </h1>
        <p className="text-muted-foreground">
          Here's an overview of your performance metrics
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Overall Score
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{overallScore}%</div>
            <Progress value={overallScore} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total KPIs
            </CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalKpis}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Assigned this period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Completed
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{completedKpis}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Fully approved
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending
            </CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{pendingKpis}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Awaiting action
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Performance by Category</CardTitle>
            <CardDescription>Distribution of KPIs across categories</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No KPIs assigned yet
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Review Status</CardTitle>
            <CardDescription>Current status of your KPIs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(statusLabels).map(([key, label]) => {
                const count = kpis?.filter(k => k.status === key).length || 0;
                const percentage = totalKpis > 0 ? (count / totalKpis) * 100 : 0;
                
                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className={statusColors[key as keyof typeof statusColors]}>
                          {label}
                        </Badge>
                      </div>
                      <span className="font-medium">{count}</span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent KPIs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent KPIs</CardTitle>
          <CardDescription>Your most recently updated KPIs</CardDescription>
        </CardHeader>
        <CardContent>
          {kpis && kpis.length > 0 ? (
            <div className="space-y-4">
              {kpis.slice(0, 5).map(kpi => (
                <div
                  key={kpi.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-card"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: kpi.kra_categories?.color || '#3B82F6' }}
                      />
                      <span className="font-medium">{kpi.kpi_name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{kpi.kra_name}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium">Target: {kpi.target_value || 'N/A'}</p>
                      <p className="text-xs text-muted-foreground">{kpi.uom || 'Units'}</p>
                    </div>
                    <Badge className={statusColors[kpi.status]}>
                      {statusLabels[kpi.status]}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No KPIs assigned yet</p>
              <p className="text-sm">Contact your manager to get started</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
