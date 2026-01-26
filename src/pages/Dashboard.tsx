import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMyKpis, useReviewSubmissions, KPI } from '@/hooks/useKpis';
import { useKraCategories } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DashboardSkeleton } from '@/components/ui/LoadingSkeletons';
import { Progress } from '@/components/ui/progress';
import { ProfileCard } from '@/components/dashboard/ProfileCard';
import { KeyStatCard } from '@/components/dashboard/KeyStatCard';
import { OverallScoreChart } from '@/components/dashboard/OverallScoreChart';
import { CategoryScoreChart } from '@/components/dashboard/CategoryScoreChart';
import { KpiTrackerModal } from '@/components/dashboard/KpiTrackerModal';
import { KpiLogicModal } from '@/components/dashboard/KpiLogicModal';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Target, TrendingUp, CheckCircle2, Clock, BarChart3, Info, Filter } from 'lucide-react';

const statusColors: Record<string, string> = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  manager_check: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  audit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const statusLabels: Record<string, string> = {
  kra_set: 'KRA Set',
  self_review: 'Self Review',
  manager_check: 'Manager Check',
  audit: 'Audit',
  approved: 'Approved',
};

const ratingColors: Record<string, string> = {
  red: '#EF4444',
  yellow: '#F59E0B',
  green: '#10B981',
  blue: '#3B82F6',
};

export default function Dashboard() {
  const { profile } = useAuth();
  const { data: kpis, isLoading: kpisLoading } = useMyKpis();
  const { data: categories, isLoading: categoriesLoading } = useKraCategories();
  const kpiIds = kpis?.map(k => k.id) || [];
  const { data: submissions } = useReviewSubmissions(kpiIds);

  const [selectedKpiTracker, setSelectedKpiTracker] = useState<KPI | null>(null);
  const [selectedKpiLogic, setSelectedKpiLogic] = useState<KPI | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  
  const { defaultPeriod, defaultYear } = useReviewPeriodDefaults();
  const [selectedPeriod, setSelectedPeriod] = useState<string>(defaultPeriod);
  const [selectedYear, setSelectedYear] = useState<number>(defaultYear);

  const isLoading = kpisLoading || categoriesLoading;

  const submissionMap = useMemo(() => 
    new Map(submissions?.map(s => [s.kpi_id, s])), 
    [submissions]
  );

  // Calculate metrics
  const metrics = useMemo(() => {
    const totalKpis = kpis?.length || 0;
    const completedKpis = kpis?.filter(k => k.status === 'approved').length || 0;
    const pendingKpis = totalKpis - completedKpis;

    let totalScore = 0;
    let totalWeight = 0;
    let totalMaxScore = 0;

    kpis?.forEach(kpi => {
      const submission = submissionMap.get(kpi.id);
      const score = submission?.final_score || submission?.self_score || 0;
      const weight = kpi.weightage || 0;
      totalScore += score * weight;
      totalWeight += weight;
      totalMaxScore += weight * 5; // Max rating is 5
    });

    const overallRating = totalWeight > 0 ? totalScore / totalWeight : 0;
    const overallPercentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;

    return { totalKpis, completedKpis, pendingKpis, totalScore, totalMaxScore, overallRating, overallPercentage };
  }, [kpis, submissionMap]);

  // Category metrics
  const categoryMetrics = useMemo(() => {
    if (!categories || !kpis) return [];

    return categories.map(cat => {
      const catKpis = kpis.filter(k => k.category_id === cat.id);
      let achieved = 0;
      let max = 0;

      catKpis.forEach(kpi => {
        const submission = submissionMap.get(kpi.id);
        const score = submission?.final_score || submission?.self_score || 0;
        const weight = kpi.weightage || 0;
        achieved += score * weight;
        max += weight * 5;
      });

      return {
        name: cat.name,
        percentage: max > 0 ? (achieved / max) * 100 : 0,
        color: cat.color,
        count: catKpis.length,
      };
    }).filter(c => c.count > 0).sort((a, b) => b.percentage - a.percentage);
  }, [categories, kpis, submissionMap]);

  // Filtered KPIs by month/year and category
  const filteredKpis = useMemo(() => {
    let filtered = kpis?.filter(k => 
      k.review_period === selectedPeriod && k.review_year === selectedYear
    ) || [];
    
    if (activeCategory !== 'All') {
      const cat = categories?.find(c => c.name === activeCategory);
      filtered = filtered.filter(k => k.category_id === cat?.id);
    }
    
    return filtered;
  }, [kpis, activeCategory, categories, selectedPeriod, selectedYear]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-8">
      {/* Profile + Filters Section */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <ProfileCard
          profile={{
            full_name: profile?.full_name,
            designation: profile?.designation,
            employee_code: profile?.employee_code,
            avatar_url: profile?.avatar_url,
            email: profile?.email,
          }}
        />
        
        {/* Filters */}
        <Card className="w-full lg:w-auto">
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Filter className="h-4 w-4" />
                <span className="font-medium">Filters</span>
              </div>
              <ReviewPeriodSelector
                selectedPeriod={selectedPeriod}
                selectedYear={selectedYear}
                onPeriodChange={setSelectedPeriod}
                onYearChange={setSelectedYear}
              />
              <Select
                value={activeCategory}
                onValueChange={setActiveCategory}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Categories</SelectItem>
                  {categoryMetrics.map(cat => (
                    <SelectItem key={cat.name} value={cat.name}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: cat.color || '#3B82F6' }}
                        />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KeyStatCard
          title="Overall Rating"
          value={`${metrics.overallRating.toFixed(2)} / 5.00`}
          icon={TrendingUp}
        />
        <KeyStatCard
          title="Total Weighted Score"
          value={`${metrics.totalScore.toFixed(1)} / ${metrics.totalMaxScore.toFixed(0)}`}
          icon={Target}
        />
        <KeyStatCard
          title="Completed KPIs"
          value={metrics.completedKpis}
          subtitle={`of ${metrics.totalKpis} total`}
          icon={CheckCircle2}
          valueClassName="text-green-600"
        />
        <KeyStatCard
          title="Pending KPIs"
          value={metrics.pendingKpis}
          subtitle="Awaiting action"
          icon={Clock}
          valueClassName="text-yellow-600"
        />
      </div>

      {/* Performance Overview Section */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-4">
        {/* Overall Score Chart - Smaller */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Overall Performance</CardTitle>
            <CardDescription className="text-xs">Achievement percentage</CardDescription>
          </CardHeader>
          <CardContent className="h-[160px]">
            <OverallScoreChart 
              percentage={metrics.overallPercentage} 
              rating={metrics.overallRating}
            />
          </CardContent>
        </Card>

        {/* Category Breakdown - Takes more space */}
        <Card className="md:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Performance by Category</CardTitle>
            <CardDescription className="text-xs">Score breakdown across KRA categories</CardDescription>
          </CardHeader>
          <CardContent className="h-[160px]">
            <CategoryScoreChart data={categoryMetrics} />
          </CardContent>
        </Card>
      </div>

      {/* Status Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Review Status</CardTitle>
          <CardDescription>Progress across review stages</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            {Object.entries(statusLabels).map(([key, label]) => {
              const count = kpis?.filter(k => k.status === key).length || 0;
              const percentage = metrics.totalKpis > 0 ? (count / metrics.totalKpis) * 100 : 0;
              
              return (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <Badge variant="secondary" className={statusColors[key]}>
                      {label}
                    </Badge>
                    <span className="font-medium">{count}</span>
                  </div>
                  <Progress value={percentage} className="h-2" />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* KPI Details Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Detailed KPI Review</CardTitle>
            <CardDescription>{filteredKpis.length} KPIs {activeCategory !== 'All' ? `in ${activeCategory}` : ''} for {selectedPeriod} {selectedYear}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>KRA / KPI</TableHead>
                <TableHead className="text-center">Target</TableHead>
                <TableHead className="text-center">Weightage</TableHead>
                <TableHead className="text-center">Achieved</TableHead>
                <TableHead className="text-center">Rating</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredKpis.map(kpi => {
                const submission = submissionMap.get(kpi.id);
                const rating = submission?.final_rating || submission?.self_rating;
                const score = submission?.final_score || submission?.self_score;
                
                return (
                  <TableRow key={kpi.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: kpi.kra_categories?.color }}
                        />
                        <span className="text-sm">{kpi.kra_categories?.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-semibold text-foreground">{kpi.kra_name}</p>
                        <p className="text-sm text-muted-foreground">{kpi.kpi_name}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {kpi.target_value}
                      {kpi.uom && <span className="text-xs text-muted-foreground ml-1">({kpi.uom})</span>}
                    </TableCell>
                    <TableCell className="text-center font-medium">{kpi.weightage}%</TableCell>
                    <TableCell className="text-center font-semibold">
                      {submission?.achieved_value || '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      {rating ? (
                        <Badge
                          style={{ backgroundColor: ratingColors[rating] }}
                          className="text-white"
                        >
                          {score?.toFixed(1) || rating}
                        </Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={statusColors[kpi.status]}>
                        {statusLabels[kpi.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedKpiLogic(kpi)}
                          title="View Rating Logic"
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedKpiTracker(kpi)}
                          title="View Tracker"
                        >
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredKpis.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No KPIs found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modals */}
      <KpiTrackerModal
        isOpen={!!selectedKpiTracker}
        onClose={() => setSelectedKpiTracker(null)}
        kpi={selectedKpiTracker}
        allKpis={kpis || []}
        submissions={submissions || []}
      />

      <KpiLogicModal
        isOpen={!!selectedKpiLogic}
        onClose={() => setSelectedKpiLogic(null)}
        kpi={selectedKpiLogic}
      />
    </div>
  );
}
