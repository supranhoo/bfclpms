import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMyKpis, useReviewSubmissions, KPI } from '@/hooks/useKpis';
import { useKraCategories } from '@/hooks/useOrganization';
import { useOrgKpiValues } from '@/hooks/useOrgKpiValues';
import { useKpiSorting } from '@/hooks/useKpiSorting';
import { useIsMobile } from '@/hooks/use-mobile';
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
import { MobileKpiCard } from '@/components/dashboard/MobileKpiCard';
import { KpiSortControl } from '@/components/ui/KpiSortControl';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Target, TrendingUp, CheckCircle2, Clock, BarChart3, Info, Filter, Building2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
  const isMobile = useIsMobile();
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

  // Fetch org KPI values for this period
  const { data: orgKpiValues } = useOrgKpiValues(undefined, selectedPeriod, selectedYear);

  // Create org KPI values lookup map
  const orgKpiValuesMap = useMemo(() => {
    const map = new Map<string, { achieved_value: number | null; data_source: string | null }>();
    orgKpiValues?.forEach(v => {
      const deptPart = v.department_id || 'null';
      const empPart = v.employee_id || 'null';
      const key = `${v.category_id}||${v.kra_name}||${v.kpi_name}||${deptPart}||${empPart}`;
      map.set(key, { achieved_value: v.achieved_value, data_source: v.data_source });
    });
    return map;
  }, [orgKpiValues]);

  // Helper to get org KPI value based on scope
  const getOrgKpiValue = (kpi: KPI) => {
    if (!kpi.is_org_level) return null;
    const scope = (kpi as any).org_level_scope || 'organization';
    let key: string;
    if (scope === 'organization') {
      key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||null||null`;
    } else if (scope === 'department') {
      const deptId = profile?.department_id || 'null';
      key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||${deptId}||null`;
    } else {
      const empId = profile?.id || 'null';
      key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||null||${empId}`;
    }
    return orgKpiValuesMap.get(key) || null;
  };

  const isLoading = kpisLoading || categoriesLoading;

  const submissionMap = useMemo(() => 
    new Map(submissions?.map(s => [s.kpi_id, s])), 
    [submissions]
  );

  // Step 1: Filter by period first (global filter)
  const periodFilteredKpis = useMemo(() => {
    return kpis?.filter(k => 
      k.review_period === selectedPeriod && k.review_year === selectedYear
    ) || [];
  }, [kpis, selectedPeriod, selectedYear]);

  // Step 2: Apply category filter on top of period filter
  const fullyFilteredKpis = useMemo(() => {
    if (activeCategory === 'All') return periodFilteredKpis;
    const cat = categories?.find(c => c.name === activeCategory);
    return periodFilteredKpis.filter(k => k.category_id === cat?.id);
  }, [periodFilteredKpis, activeCategory, categories]);

  // Calculate metrics from FILTERED KPIs (global filtering applied)
  const metrics = useMemo(() => {
    const data = fullyFilteredKpis;
    const totalKpis = data.length;
    const completedKpis = data.filter(k => k.status === 'approved').length;
    const pendingKpis = totalKpis - completedKpis;

    let totalScore = 0;
    let totalWeight = 0;
    let totalMaxScore = 0;

    data.forEach(kpi => {
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
  }, [fullyFilteredKpis, submissionMap]);

  // Category metrics from FILTERED KPIs
  const categoryMetrics = useMemo(() => {
    if (!categories) return [];
    const data = fullyFilteredKpis;

    return categories.map(cat => {
      const catKpis = data.filter(k => k.category_id === cat.id);
      let achieved = 0;
      let max = 0;

      catKpis.forEach(kpi => {
        const submission = submissionMap.get(kpi.id);
        const score = submission?.final_score || submission?.self_score || 0;
        const weight = kpi.weightage || 0;
        achieved += score * weight;
        max += weight * 5;
      });

      // Calculate category weightage from sum of KPI weightages
      const categoryWeightage = catKpis.reduce((sum, kpi) => sum + (kpi.weightage || 0), 0);

      return {
        name: cat.name,
        percentage: max > 0 ? (achieved / max) * 100 : 0,
        color: cat.color,
        count: catKpis.length,
        weightage: categoryWeightage,
      };
    }).filter(c => c.count > 0).sort((a, b) => b.percentage - a.percentage);
  }, [categories, fullyFilteredKpis, submissionMap]);

  // Available categories for filter dropdown (based on period-filtered KPIs)
  const availableCategories = useMemo(() => {
    if (!categories) return [];
    return categories.filter(cat => 
      periodFilteredKpis.some(k => k.category_id === cat.id)
    );
  }, [categories, periodFilteredKpis]);

  // Sorting with default Weightage (High to Low)
  const { sortedKpis, sortConfig, setSort } = useKpiSorting(fullyFilteredKpis);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* 1. Profile Card - Full Width */}
      <ProfileCard
        profile={{
          full_name: profile?.full_name,
          designation: profile?.designation,
          employee_code: profile?.employee_code,
          avatar_url: profile?.avatar_url,
          email: profile?.email,
        }}
      />

      {/* 2. Filters Row - Prominent, Full Width */}
      <Card className="bg-muted/30">
        <CardContent className="py-3 sm:py-4">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Filter className="h-4 w-4" />
                <span>Filters</span>
              </div>
              <ReviewPeriodSelector
                selectedPeriod={selectedPeriod}
                selectedYear={selectedYear}
                onPeriodChange={setSelectedPeriod}
                onYearChange={setSelectedYear}
                className="w-full sm:w-auto"
              />
              <Select
                value={activeCategory}
                onValueChange={setActiveCategory}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Categories</SelectItem>
                  {availableCategories.map(cat => (
                    <SelectItem key={cat.id} value={cat.name}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: cat.color || 'hsl(var(--primary))' }}
                        />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground sm:text-right">
              Showing <span className="font-semibold text-foreground">{fullyFilteredKpis.length}</span> of{' '}
              <span className="font-semibold text-foreground">{kpis?.length || 0}</span> KPIs
              {' '}for <span className="font-semibold text-foreground">{selectedPeriod} {selectedYear}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Performance Charts Row - 1:5 ratio on desktop, stacked on mobile */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-6">
        {/* Overall Score Chart - Small (1/6) */}
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Overall</CardTitle>
            <CardDescription className="text-xs">Performance</CardDescription>
          </CardHeader>
          <CardContent className="h-[120px] sm:h-[140px]">
            <OverallScoreChart 
              percentage={metrics.overallPercentage} 
              rating={metrics.overallRating}
            />
          </CardContent>
        </Card>

        {/* Category Breakdown - Wide (5/6) */}
        <Card className="md:col-span-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Performance by Category</CardTitle>
            <CardDescription className="text-xs">Score breakdown across KRA categories</CardDescription>
          </CardHeader>
          <CardContent style={{ height: Math.max(180, categoryMetrics.length * 50) }}>
            <CategoryScoreChart data={categoryMetrics} />
          </CardContent>
        </Card>
      </div>

      {/* 4. Stats Cards - 2 columns on mobile, 4 on desktop */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <KeyStatCard
          title="Monthly Rating"
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

      {/* 5. Status Progress */}
      <Card>
        <CardHeader className="pb-2 sm:pb-4">
          <CardTitle className="text-base sm:text-lg">Review Status</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Progress across review stages</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:grid sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
            {Object.entries(statusLabels).map(([key, label]) => {
              const count = fullyFilteredKpis.filter(k => k.status === key).length;
              const percentage = metrics.totalKpis > 0 ? (count / metrics.totalKpis) * 100 : 0;
              
              return (
                <div key={key} className="flex sm:flex-col items-center sm:items-start gap-2 sm:space-y-2">
                  <div className="flex items-center justify-between w-full sm:w-auto text-sm">
                    <Badge variant="secondary" className={statusColors[key]}>
                      {label}
                    </Badge>
                    <span className="font-medium sm:hidden">{count}</span>
                  </div>
                  <Progress value={percentage} className="h-2 flex-1 sm:flex-none sm:w-full" />
                  <span className="font-medium hidden sm:block">{count}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 6. KPI Details - Table on desktop, Cards on mobile */}
      <Card>
        <CardHeader className="pb-2 sm:pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <CardTitle className="text-base sm:text-lg">Detailed KPI Review</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                {sortedKpis.length} KPIs {activeCategory !== 'All' ? `in ${activeCategory}` : ''} for {selectedPeriod} {selectedYear}
              </CardDescription>
            </div>
            {!isMobile && <KpiSortControl sortConfig={sortConfig} onSortChange={setSort} />}
          </div>
        </CardHeader>
        <CardContent>
          {isMobile ? (
            // Mobile: Stacked KPI Cards
            <div className="space-y-3">
              {sortedKpis.map(kpi => (
                <MobileKpiCard
                  key={kpi.id}
                  kpi={kpi}
                  submission={submissionMap.get(kpi.id)}
                  statusColors={statusColors}
                  statusLabels={statusLabels}
                  ratingColors={ratingColors}
                  onViewLogic={setSelectedKpiLogic}
                  onViewTracker={setSelectedKpiTracker}
                />
              ))}
              {sortedKpis.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No KPIs found for the selected filters
                </div>
              )}
            </div>
          ) : (
            // Desktop: Full Table
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
                {sortedKpis.map(kpi => {
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
                {sortedKpis.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No KPIs found for the selected filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
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
